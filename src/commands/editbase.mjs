import {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { requireStaff } from '../lib/staff-gate.mjs';
import { listBases, updateBase } from '../lib/bases-api.mjs';
import { buildShowcase } from '../lib/base-showcase.mjs';

/**
 * /editbase — fix a base you already added.
 *
 * Without this the only repair is adding it again, which leaves two entries
 * in the library and, if it was posted, two messages in the channel -- one of
 * them wrong, with nothing to tell a subscriber which. So this edits in place
 * and, when the base was posted, edits that message too.
 *
 * Every option is optional on purpose: the site patches only what it is sent,
 * so correcting a title cannot blank the notes you did not touch.
 *
 * Type is deliberately not editable here. Changing it moves a base between a
 * season people own and a pack people buy, which belongs in the admin panel
 * where the consequences are visible.
 */

const data = new SlashCommandBuilder()
  .setName('editbase')
  .setDescription('Fix a base that is already in the library')
  .addStringOption((o) =>
    o.setName('base').setDescription('Which base to fix').setRequired(true).setAutocomplete(true))
  .addStringOption((o) =>
    o.setName('title').setDescription('New title').setRequired(false))
  .addStringOption((o) =>
    o.setName('link').setDescription('New Copy Layout Link -- also refreshes the Town Hall level').setRequired(false))
  .addAttachmentOption((o) =>
    o.setName('screenshot').setDescription('Replace the screenshot').setRequired(false))
  .addStringOption((o) =>
    o.setName('season').setDescription('Legend season, e.g. "September 2026"').setRequired(false))
  .addStringOption((o) =>
    o.setName('notes').setDescription('Replace the notes').setRequired(false))
  .addStringOption((o) =>
    o.setName('tags').setDescription('Replace the tags, comma separated').setRequired(false));

async function autocomplete(interaction) {
  const typed = interaction.options.getFocused();
  try {
    const { bases } = await listBases(null, typed);
    await interaction.respond(
      bases.slice(0, 25).map((b) => ({
        name: `${b.title} (TH${b.thLevel}, ${b.type})`.slice(0, 100),
        value: b.id,
      })),
    );
  } catch {
    // An empty list is a dead end the builder can see; an error here shows
    // nothing at all and looks like the command is broken.
    await interaction.respond([]).catch(() => {});
  }
}

async function execute(interaction) {
  if (!(await requireStaff(interaction, { roleEnv: 'BASES_REQUIRED_ROLE_ID' }))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const id = interaction.options.getString('base', true);
  const title = interaction.options.getString('title');
  const link = interaction.options.getString('link');
  const season = interaction.options.getString('season');
  const notes = interaction.options.getString('notes');
  const tagsRaw = interaction.options.getString('tags');
  const attachment = interaction.options.getAttachment('screenshot');

  if (attachment && !(attachment.contentType || '').startsWith('image/')) {
    return interaction.editReply('That attachment is not an image. Attach a screenshot, or leave it out.');
  }

  const patch = { id };
  if (title !== null) patch.title = title;
  if (link !== null) patch.layoutLink = link;
  if (season !== null) patch.legendMonth = season;
  if (notes !== null) patch.notes = notes;
  if (tagsRaw !== null) patch.tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
  if (attachment) patch.screenshotUrl = attachment.url;

  if (Object.keys(patch).length === 1) {
    return interaction.editReply('Nothing to change -- fill in at least one field.');
  }

  let res;
  try {
    res = await updateBase(patch);
  } catch (e) {
    return interaction.editReply(`Could not update that base: ${e.message}`);
  }

  const embed = new EmbedBuilder()
    .setTitle('Base updated')
    .setColor(0x2a6fae)
    .addFields(
      { name: 'Title', value: res.title, inline: true },
      { name: 'Town Hall', value: `TH${res.thLevel}${res.mode === 'WB' ? ' (Builder Base)' : ''}`, inline: true },
      { name: 'Type', value: res.type, inline: true },
    );
  if (res.legendMonth) embed.addFields({ name: 'Season', value: res.legendMonth, inline: true });

  const warn = attachment && res.imageHosted === false
    ? '\n⚠️ The new screenshot could not be saved. The old one is still in place.'
    : '';

  // Correct the channel post too, so the library and the channel cannot
  // disagree. Only for a base that was actually posted.
  let postNote = '';
  if (res.postedChannelId && res.postedMessageId) {
    try {
      const channel = await interaction.client.channels.fetch(res.postedChannelId);
      const message = await channel.messages.fetch(res.postedMessageId);

      const show = buildShowcase({
        title: res.title,
        saved: res,
        screenshotUrl: res.screenshotUrl,
        siteUrl: process.env.BASES_API_URL,
      });

      const showEmbed = new EmbedBuilder()
        .setTitle(show.title)
        .setColor(0x2a6fae)
        .addFields({ name: 'Town Hall', value: show.townHall, inline: true });
      if (show.season) showEmbed.addFields({ name: 'Season', value: show.season, inline: true });
      if (show.imageUrl) showEmbed.setImage(show.imageUrl);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Download base')
          .setStyle(ButtonStyle.Link)
          .setURL(show.openUrl),
      );

      await message.edit({ embeds: [showEmbed], components: [row] });
      postNote = '\nThe post in the channel was updated too.';
    } catch (e) {
      // The library is already correct. Say which half failed, or the builder
      // edits again and wonders why nothing changes.
      postNote = `\n⚠️ Saved, but the channel post could not be updated: ${e.message}`;
    }
  }

  return interaction.editReply({
    content: `Updated.${warn}${postNote}`,
    embeds: [embed],
  });
}

export default { data, execute, autocomplete };
