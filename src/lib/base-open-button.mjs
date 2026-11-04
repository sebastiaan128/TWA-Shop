import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import { getBaseLink, getBasehubLink } from './bases-api.mjs';

/**
 * The Download button under a posted base.
 *
 * WHY THIS IS NOT A LINK BUTTON ANY MORE
 *
 * It used to point straight at the site, which resolves the signed-in viewer's
 * own /r/<token> -- the only reason a download can be attributed to anyone.
 * That works for subscribers, and it works for nobody else: reaching a token
 * needs a site account WITH a linked Discord account, and the builders and
 * partners in the Vatic role have neither. For them the button was a dead end
 * that ended in an OAuth screen.
 *
 * So the click comes to the bot instead, which is the one place that can see
 * who clicked without asking them to sign in to anything. Two paths out:
 *
 *   Vatic role -> the raw layout link, ephemeral. No token, so no download log
 *                 for these people. That is the accepted trade: they are the
 *                 handful who are trusted with the link itself.
 *   everyone else -> the same site link as before, as a link button in an
 *                 ephemeral reply. One extra click, identical outcome.
 *
 * As with the Edit button, Discord cannot hide a component from some viewers,
 * so the gate is on the click and the answer is ephemeral.
 */

const PREFIX = 'openbase';

export const isOpenBaseId = (customId) =>
  typeof customId === 'string' && customId.startsWith(`${PREFIX}:`);

export const baseIdFromOpen = (customId) => customId.slice(PREFIX.length + 1);

export function openButtonRow(baseId) {
  // A button with no id would post fine and then answer nothing on click --
  // worse than refusing here, where the builder is still looking at it.
  if (!baseId) throw new Error('a base id is required to build the download button');
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:${baseId}`)
      .setLabel('Download base')
      .setStyle(ButtonStyle.Primary),
  );
}

/**
 * Exact membership, not the positional check staff-gate uses.
 *
 * Vatic is not a rank with more senior roles stacked above it, so "any role at
 * or above this one" would quietly widen who receives raw layout links every
 * time someone reorders the role list.
 *
 * Fails CLOSED on a missing role id: an unset env var must send everyone down
 * the site path, never hand the link to the whole channel.
 */
export const hasVaticRole = (roleIds, configuredRoleId) =>
  Boolean(configuredRoleId) && Array.isArray(roleIds) && roleIds.includes(configuredRoleId);

/**
 * What a click gets: 'link' (the raw layout link), 'site' (the personal site
 * link), 'basehub' (a personal /r/ link minted for this member) or 'denied'.
 *
 * Team Winter's basehub is a different server: the site cannot tie its members
 * to an account, so the bot asks for a token in the member's name. Never the
 * raw link there: every open stays logged and a leak points at a person.
 * Basehub role or nothing; fails closed when that role is not configured.
 */
export function openAccess({ guildId, roleIds, env = process.env }) {
  if (env.BASEHUB_GUILD_ID && guildId === env.BASEHUB_GUILD_ID) {
    return hasVaticRole(roleIds, env.BASEHUB_ROLE_ID) ? 'basehub' : 'denied';
  }
  return hasVaticRole(roleIds, env.VATIC_ROLE_ID) ? 'link' : 'site';
}

// A cached member has roles.cache; one from a server the bot does not cache
// arrives as the raw payload with an array of ids.
const memberRoleIds = (member) => {
  if (member?.roles?.cache) return [...member.roles.cache.keys()];
  return Array.isArray(member?.roles) ? member.roles : null;
};

export async function handleOpenButton(interaction) {
  const baseId = baseIdFromOpen(interaction.customId);
  const access = openAccess({ guildId: interaction.guildId, roleIds: memberRoleIds(interaction.member) });

  if (access === 'denied') {
    return interaction.reply({
      content: 'You need the required role in this server to open this base.',
      flags: MessageFlags.Ephemeral,
    });
  }
  if (access === 'site') {
    return sendSiteLink(interaction, baseId);
  }
  if (access === 'basehub') {
    return sendBasehubLink(interaction, baseId);
  }

  // The site call can take a moment, and an expired interaction token cannot
  // be answered at all.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let base;
  try {
    base = await getBaseLink(baseId);
  } catch (e) {
    // Falling back to the site link rather than an error: the base is fine,
    // and the site path still works for anyone with an account.
    const site = siteBaseUrl();
    return interaction.editReply({
      content: `Could not fetch that layout link: ${e.message}`
        + (site ? `\nYou can still open it on the site: ${site}/base/${encodeURIComponent(baseId)}` : ''),
    });
  }

  const th = base.thLevel ? `TH${base.thLevel}${base.mode === 'WB' ? ' (War base)' : ''}` : null;
  return interaction.editReply({
    content: [
      `**${base.title}**${th ? ` — ${th}` : ''}`,
      // In a code block so it is one tap to copy on mobile, and so Discord
      // does not turn it into a preview card that hides the link itself.
      `\`\`\`\n${base.layoutLink}\n\`\`\``,
      '_Only you can see this. Please do not share the link._',
    ].join('\n'),
  });
}

const siteBaseUrl = () => String(process.env.BASES_API_URL || '').trim().replace(/\/+$/, '');

/**
 * The old behaviour, one click later: the site resolves this viewer's own
 * token, so their download stays attributable.
 */
function sendSiteLink(interaction, baseId) {
  const site = siteBaseUrl();
  if (!site) {
    return interaction.reply({
      content: 'This base cannot be opened right now. Tell a builder the site link is not configured.',
      flags: MessageFlags.Ephemeral,
    });
  }
  return interaction.reply({
    content: 'Open this base with your own account — your download is linked to you.',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open on the site')
          .setStyle(ButtonStyle.Link)
          .setURL(`${site}/base/${encodeURIComponent(baseId)}`),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

/** A personal tracked link for a basehub member, as a link button. */
async function sendBasehubLink(interaction, baseId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let base;
  try {
    base = await getBasehubLink(baseId, {
      userId: interaction.user.id,
      name: interaction.member?.nick || interaction.user.globalName || interaction.user.username,
    });
  } catch (e) {
    return interaction.editReply({ content: `Could not open that base: ${e.message}` });
  }
  const th = base.thLevel ? `TH${base.thLevel}${base.mode === 'WB' ? ' (War base)' : ''}` : null;
  return interaction.editReply({
    content: [
      `**${base.title}**${th ? ` — ${th}` : ''}`,
      'This link is personal and every download is linked to you. Please do not share it.',
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Open base').setStyle(ButtonStyle.Link).setURL(base.url),
      ),
    ],
  });
}
