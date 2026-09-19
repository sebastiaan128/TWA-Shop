import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { updateBase } from './bases-api.mjs';
import { buildShowcase } from './base-showcase.mjs';
import { openButtonRow } from './base-open-button.mjs';

/**
 * The Edit button under a posted base.
 *
 * A builder who spots a typo can fix it from the post itself rather than
 * remembering a command and finding the base in a list again.
 *
 * WHY THE BUTTON IS VISIBLE TO EVERYONE
 *
 * Discord has no way to hide a component from some viewers: a message's
 * components are part of the message, and everyone who can read it sees them.
 * So the gate is on the click instead, and the refusal is ephemeral -- the
 * subscriber who taps it out of curiosity is the only one who sees the answer.
 *
 * The base id travels in the custom id because a modal submission arrives as a
 * fresh interaction with no memory of the message it came from.
 */

const PREFIX = 'editbase';

export const editButtonRow = (baseId) => new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId(`${PREFIX}:${baseId}`)
    .setLabel('Edit')
    .setStyle(ButtonStyle.Secondary),
);

export const isEditBaseId = (customId) => typeof customId === 'string' && customId.startsWith(`${PREFIX}:`);
const baseIdFrom = (customId) => customId.slice(PREFIX.length + 1);

/**
 * Does this member hold the builder role, or anything above it?
 *
 * Positional rather than an exact match, matching requireStaff: the roles
 * above the builder role are the more senior ones, so staff get in without
 * anyone having to also grant them the lower role.
 *
 * Fails CLOSED when the role is not configured -- a missing env var must not
 * quietly let every subscriber rewrite the library.
 */
function mayEdit(interaction) {
  const requiredId = process.env.BASES_REQUIRED_ROLE_ID;
  if (!requiredId) return false;
  const required = interaction.guild?.roles?.cache?.get(requiredId);
  if (!required) return false;
  return interaction.member?.roles?.cache?.some((r) => r.position >= required.position) === true;
}

export async function handleEditButton(interaction) {
  if (!mayEdit(interaction)) {
    return interaction.reply({
      content: 'Only builders can edit a base. If you spotted something wrong with it, say so in the channel.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const baseId = baseIdFrom(interaction.customId);
  const current = interaction.message.embeds?.[0];

  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX}:${baseId}`)
    .setTitle('Edit base');

  // Prefilled from the post so a builder correcting the link does not have to
  // retype a title that was already right.
  const title = new TextInputBuilder()
    .setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short)
    .setRequired(false).setMaxLength(120)
    .setValue(current?.title?.slice(0, 120) || '');

  // Deliberately not prefilled: the post never carries the layout link, and
  // putting one in a modal would show it to the builder's client in a context
  // that is easy to copy out of. Empty means "leave it alone".
  const link = new TextInputBuilder()
    .setCustomId('link').setLabel('New layout link (leave empty to keep)')
    .setStyle(TextInputStyle.Short).setRequired(false);

  const season = new TextInputBuilder()
    .setCustomId('season').setLabel('Season, e.g. September 2026')
    .setStyle(TextInputStyle.Short).setRequired(false)
    .setValue(current?.fields?.find((f) => f.name === 'Season')?.value || '');

  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(link),
    new ActionRowBuilder().addComponents(season),
  );

  return interaction.showModal(modal);
}

export async function handleEditModal(interaction) {
  // Re-checked on submit: the modal was opened by someone who passed, but a
  // submission is a separate interaction and must not be trusted to have come
  // from that same check.
  if (!mayEdit(interaction)) {
    return interaction.reply({ content: 'Only builders can edit a base.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const baseId = baseIdFrom(interaction.customId);
  const title = interaction.fields.getTextInputValue('title').trim();
  const link = interaction.fields.getTextInputValue('link').trim();
  const season = interaction.fields.getTextInputValue('season').trim();

  const patch = { id: baseId };
  if (title) patch.title = title;
  if (link) patch.layoutLink = link;
  if (season) patch.legendMonth = season;

  if (Object.keys(patch).length === 1) {
    return interaction.editReply('Nothing changed.');
  }

  let res;
  try {
    res = await updateBase(patch);
  } catch (e) {
    return interaction.editReply(`Could not update that base: ${e.message}`);
  }

  try {
    const show = buildShowcase({
      title: res.title,
      saved: res,
      screenshotUrl: res.screenshotUrl,
      siteUrl: process.env.BASES_API_URL,
    });

    const embed = {
      title: show.title,
      color: 0x2a6fae,
      fields: [
        { name: 'Town Hall', value: show.townHall, inline: true },
        ...(show.season ? [{ name: 'Season', value: show.season, inline: true }] : []),
      ],
      ...(show.imageUrl ? { image: { url: show.imageUrl } } : {}),
    };

    // Rebuilt rather than patched: the download button carries the base id,
    // and dropping the components on an edit would strip it. Rebuilding also
    // upgrades a post from before the button became a bot button, so an old
    // post starts working for the Vatic role the first time it is edited.
    await interaction.message.edit({
      embeds: [embed],
      components: [openButtonRow(baseId), editButtonRow(baseId)],
    });
  } catch (e) {
    // The library is already correct. Saying "failed" here would send the
    // builder round again to fix something that is not broken.
    return interaction.editReply(`Saved, but this post could not be updated: ${e.message}`);
  }

  return interaction.editReply('Updated.');
}
