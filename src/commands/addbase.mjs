import {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { requireStaff } from '../lib/staff-gate.mjs';
import { saveBase, updateBase } from '../lib/bases-api.mjs';
import { buildShowcase, SHOWCASE_REACTIONS } from '../lib/base-showcase.mjs';
import { editButtonRow } from '../lib/base-edit-button.mjs';

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
    o.setName('tags').setDescription('Comma separated, e.g. anti-3, ring').setRequired(false))
  .addStringOption((o) =>
    o.setName('season').setDescription('Legend season, e.g. "September 2026". Defaults to the current season.').setRequired(false))
  .addBooleanOption((o) =>
    o.setName('post').setDescription('Also show this base publicly in this channel').setRequired(false));

async function execute(interaction) {
  if (!(await requireStaff(interaction, { roleEnv: 'BASES_REQUIRED_ROLE_ID' }))) return;

  // The image is fetched and re-hosted server-side, which can take a moment.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const title = interaction.options.getString('title', true);
  const type = interaction.options.getString('type', true);
  const link = interaction.options.getString('link', true);
  const notes = interaction.options.getString('notes') || '';
  const tagsRaw = interaction.options.getString('tags') || '';
  const season = interaction.options.getString('season') || null;
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
      legendMonth: season,
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
    // Surfaced immediately so a wrong default season is caught here rather
    // than discovered later as "the base I posted never arrived".
    const seasonLine = res.legendMonth ? `\nSeason: **${res.legendMonth}**` : '';

    // Showing the base publicly is a separate, opt-in step. Every base type
    // goes through this command, including the war and CWL layouts that are
    // sold inside packs -- publishing one of those by default would give away
    // a paid product on the builder's first typo.
    let postNote = '';
    if (interaction.options.getBoolean('post')) {
      // Only legend bases can be opened from a channel button. A war, CWL or
      // ESL base is owned through the pack it was sold in, not through a
      // season, so the site has no per-person link to hand out for one -- the
      // button would post fine and then fail on the first click. Refused here,
      // where the builder is still looking at the result.
      if (type !== 'legend') {
        postNote = '\n\u26A0\uFE0F Not posted: only Legend bases can be shown in a channel.'
          + ` A ${type.toUpperCase()} base is delivered with its pack.`;
      } else {
        try {
          const show = buildShowcase({
            title,
            saved: res,
            screenshotUrl: attachment?.url || null,
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

          const posted = await interaction.channel.send({
            embeds: [showEmbed],
            components: [row, editButtonRow(res.id)],
          });
          postNote = '\nPosted in this channel.';

          // Remembered so /editbase can correct this message in place. Without
          // it a fixed library entry sits next to a stale post that nobody can
          // tell is stale. Best effort: the post already succeeded, and losing
          // the pointer is worth less than an error the builder acts on.
          await updateBase({
            id: res.id,
            postedChannelId: posted.channelId,
            postedMessageId: posted.id,
          }).catch(() => {});

          // Decoration, so a missing Add Reactions permission must not turn a
          // successful post into an error the builder then tries to fix.
          for (const emoji of SHOWCASE_REACTIONS) {
            await posted.react(emoji).catch(() => {});
          }
        } catch (e) {
          // The base is already saved at this point. A failed post must read
          // as exactly that, not as a failed save -- otherwise the builder
          // adds it a second time and the library ends up with a duplicate.
          postNote = `\n\u26A0\uFE0F Saved, but could not post it here: ${e.message}`;
        }
      }
    }

    return interaction.editReply({
      content: `Added to the library. Edit tags and notes on the site.${warn}${seasonLine}${postNote}`,
      embeds: [embed],
    });
  } catch (e) {
    return interaction.editReply(`Could not add that base: ${e.message}`);
  }
}

export default { data, execute };
