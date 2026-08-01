import {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  ActionRowBuilder, StringSelectMenuBuilder, ComponentType,
} from 'discord.js';
import { requireStaff } from '../lib/staff-gate.mjs';
import { listBases, savePack } from '../lib/bases-api.mjs';

/**
 * /createpack — group bases into a named pack.
 *
 * The bases are picked from a select menu rather than typed as ids: nobody is
 * going to copy Firestore ids into a slash command, and a menu makes the
 * choice from the real library.
 *
 * Discord caps a select menu at 25 options, so this offers the 25 most recent
 * bases, optionally filtered by type. Building a pack from anything older is a
 * job for the site, which has search.
 *
 * Packs created here are always DRAFTS. Publishing is a deliberate step on the
 * site, so a pack cannot start selling before it has been looked over -- and a
 * draft is never granted on purchase.
 */

const PICK_TIMEOUT_MS = 120_000;

const data = new SlashCommandBuilder()
  .setName('createpack')
  .setDescription('Create a pack from bases in the library')
  .addStringOption((o) =>
    o.setName('name').setDescription('Short name, e.g. july').setRequired(true))
  .addStringOption((o) =>
    o.setName('title').setDescription('Shown to buyers, e.g. July CWL Pack').setRequired(false))
  .addIntegerOption((o) =>
    o.setName('users')
      .setDescription('How many people will use it (a 15-player clan = 15)')
      .setMinValue(1).setMaxValue(200).setRequired(false))
  .addStringOption((o) =>
    o.setName('type').setDescription('Only show bases of this type').setRequired(false)
      .addChoices(
        { name: 'War', value: 'war' },
        { name: 'CWL', value: 'cwl' },
        { name: 'Legend League', value: 'legend' },
        { name: 'ESL', value: 'esl' },
      ));

async function execute(interaction) {
  if (!(await requireStaff(interaction, { roleEnv: 'BASES_REQUIRED_ROLE_ID' }))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = interaction.options.getString('name', true);
  const title = interaction.options.getString('title') || '';
  const seats = interaction.options.getInteger('users') || 1;
  const type = interaction.options.getString('type');

  let bases;
  try {
    ({ bases } = await listBases(type));
  } catch (e) {
    return interaction.editReply(`Could not load the library: ${e.message}`);
  }

  if (!bases.length) {
    return interaction.editReply(
      type
        ? `There are no ${type} bases in the library yet. Add some with /addbase.`
        : 'The base library is empty. Add some with /addbase.'
    );
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('pack-bases')
    .setPlaceholder('Pick the bases for this pack')
    .setMinValues(1)
    .setMaxValues(bases.length)
    .addOptions(bases.map((b) => ({
      label: b.title.slice(0, 100),
      description: `TH${b.thLevel} · ${b.type}`.slice(0, 100),
      value: b.id,
    })));

  const msg = await interaction.editReply({
    content:
      `**${name}**: pick the bases, in the order buyers should see them.\n` +
      `Showing the ${bases.length} most recent${type ? ` ${type}` : ''} base${bases.length === 1 ? '' : 's'}.`,
    components: [new ActionRowBuilder().addComponents(menu)],
  });

  let picked;
  try {
    const selection = await msg.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      // Only the person who ran the command can answer their own prompt.
      filter: (i) => i.user.id === interaction.user.id,
      time: PICK_TIMEOUT_MS,
    });
    picked = selection.values;
    await selection.deferUpdate();
  } catch {
    return interaction.editReply({
      content: 'Timed out. Run /createpack again when you are ready.',
      components: [],
    });
  }

  try {
    const res = await savePack({
      name,
      title,
      baseIds: picked,
      seats,
      published: false,
    });

    const chosen = picked
      .map((id) => bases.find((b) => b.id === id))
      .filter(Boolean);

    const embed = new EmbedBuilder()
      .setTitle(res.created ? 'Pack created' : 'Pack updated')
      .setColor(0x2a6fae)
      .setDescription(chosen.map((b, i) => `**${i + 1}.** ${b.title} · TH${b.thLevel}`).join('\n'))
      .addFields(
        { name: 'Name', value: `\`${res.id}\``, inline: true },
        { name: 'Bases', value: String(res.baseCount), inline: true },
        { name: 'Expected users', value: String(seats), inline: true },
      )
      .setFooter({ text: 'Draft. Publish it on the site to start delivering it.' });

    return interaction.editReply({
      content:
        'Saved as a **draft**. Link the Stripe product and publish it on the site: ' +
        'buying a draft pack delivers nothing.',
      embeds: [embed],
      components: [],
    });
  } catch (e) {
    return interaction.editReply({
      content: `Could not save that pack: ${e.message}`,
      components: [],
    });
  }
}

export default { data, execute };
