import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { requireStaff } from '../lib/staff-gate.mjs';
import { saveBase } from '../lib/bases-api.mjs';

/**
 * /addbase — quick capture for a base you just built.
 *
 * Deliberately minimal: title, type, link, screenshot. Tags, notes, edits and
 * archiving all live on the site, where a form is far better than a slash
 * command. This exists for the moment right after you finish a base, when
 * switching to a browser is the thing that stops it getting logged at all.
 *
 * Town Hall level and mode are NOT asked for: they are read from the layout
 * link server-side, so they cannot disagree with the link a buyer opens.
 */

const data = new SlashCommandBuilder()
  .setName('addbase')
  .setDescription('Add a base to the library')
  .addStringOption((o) =>
    o.setName('title').setDescription('e.g. TH16 Anti-3 War').setRequired(true))
  .addStringOption((o) =>
    o.setName('type').setDescription('Which product line this base is for').setRequired(true)
      .addChoices(
        { name: 'War', value: 'war' },
        { name: 'CWL', value: 'cwl' },
        { name: 'Legend League', value: 'legend' },
        { name: 'ESL', value: 'esl' },
      ))
  .addStringOption((o) =>
    o.setName('link').setDescription('Copy Layout Link from Clash of Clans').setRequired(true))
  .addAttachmentOption((o) =>
    o.setName('screenshot').setDescription('Screenshot of the base').setRequired(false))
  .addStringOption((o) =>
    o.setName('notes').setDescription('Shown to buyers in the pack PDF').setRequired(false))
  .addStringOption((o) =>
    o.setName('tags').setDescription('Comma separated, e.g. anti-3, ring').setRequired(false));

async function execute(interaction) {
  if (!(await requireStaff(interaction))) return;

  // The image is fetched and re-hosted server-side, which can take a moment.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const title = interaction.options.getString('title', true);
  const type = interaction.options.getString('type', true);
  const link = interaction.options.getString('link', true);
  const notes = interaction.options.getString('notes') || '';
  const tagsRaw = interaction.options.getString('tags') || '';
  const attachment = interaction.options.getAttachment('screenshot');

  if (attachment && !(attachment.contentType || '').startsWith('image/')) {
    return interaction.editReply('That attachment is not an image. Attach a screenshot, or leave it out.');
  }

  try {
    const res = await saveBase({
      title,
      type,
      layoutLink: link,
      // The site downloads this immediately: Discord attachment URLs are
      // signed and expire within about a day, so the URL itself is useless
      // to store.
      screenshotUrl: attachment?.url || null,
      notes,
      tags: tagsRaw.split(',').map((t) => t.trim()).filter(Boolean),
    });

    const embed = new EmbedBuilder()
      .setTitle('Base added')
      .setColor(0x2a6fae)
      .addFields(
        { name: 'Title', value: title, inline: true },
        { name: 'Town Hall', value: `TH${res.thLevel}${res.mode === 'WB' ? ' (Builder Base)' : ''}`, inline: true },
        { name: 'Type', value: type, inline: true },
      );
    if (attachment?.url) embed.setThumbnail(attachment.url);

    const warn = attachment && !res.imageHosted
      ? '\n⚠️ The screenshot could not be saved. Add it on the site.'
      : '';

    return interaction.editReply({
      content: `Added to the library. Edit tags and notes on the site.${warn}`,
      embeds: [embed],
    });
  } catch (e) {
    return interaction.editReply(`Could not add that base: ${e.message}`);
  }
}

export default { data, execute };
