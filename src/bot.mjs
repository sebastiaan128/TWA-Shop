import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Partials, Events, REST, Routes, EmbedBuilder, MessageFlags, AttachmentBuilder } from 'discord.js';
import { buildTranscriptHtml } from './lib/ticket-transcript.mjs';
import { registerCommandsMap } from './commands/index.mjs';
import { handleCloseTicket, handleDeleteTicket } from './tickets.mjs';
import { startYesterdayEodScheduler } from './lib/daily-eod-post.mjs';
import { isEditBaseId, handleEditButton, handleEditModal } from './lib/base-edit-button.mjs';
import { isOpenBaseId, handleOpenButton } from './lib/base-open-button.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const isHealthcheck = !!process.env.HEALTHCHECK;
const TRANSCRIPT_CHANNEL_ID = '1370746360030167121';

function panelFromChannelName(name) {
  if (name.includes('💎')) return 'Legend League';
  if (name.includes('📦')) return 'Basepack';
  if (name.includes('⚔')) return 'CWL';
  if (name.includes('🛡')) return 'ESL';
  if (name.includes('🧩')) return 'Custom';
  return 'General';
}

async function postTranscript(channel) {
  // Raw REST JSON rather than discord.js Message objects, so the bot renders
  // with the same builder as the admin panel. Paginated, newest first.
  const all = [];
  let before;
  while (true) {
    const query = new URLSearchParams({ limit: '100', ...(before ? { before } : {}) });
    const batch = await channel.client.rest.get(Routes.channelMessages(channel.id), { query });
    if (!batch.length) break;
    all.push(...batch);
    before = batch.at(-1).id;
    if (batch.length < 100) break;
  }
  all.reverse(); // chronological

  // Count messages per user
  const counts = new Map();
  for (const m of all) {
    const id = m.author.id;
    if (!counts.has(id)) counts.set(id, { user: m.author, count: 0 });
    counts.get(id).count++;
  }
  const sorted = [...counts.values()].sort((a, b) => b.count - a.count);

  // Ticket owner: purchaser = member overwrite with ViewChannel allow, excluding all bots
  let ownerUser = null;
  for (const [id, ow] of channel.permissionOverwrites.cache) {
    if (ow.type === 1 && id !== channel.client.user.id) {
      try {
        const member = await channel.guild.members.fetch(id);
        if (!member.user.bot) { ownerUser = member.user; break; }
      } catch { /* ignore */ }
    }
  }
  // Fallback: extract username from channel name (│💎│0004┋_naffc_)
  if (!ownerUser) {
    const match = channel.name.match(/┋_(.+?)_$/);
    if (match) {
      try {
        const members = await channel.guild.members.search({ query: match[1], limit: 1 });
        const found = members.first();
        if (found && !found.user.bot) ownerUser = found.user;
      } catch { /* ignore */ }
    }
  }

  const panel = panelFromChannelName(channel.name);
  const ownerMention = ownerUser ? `<@${ownerUser.id}>` : 'Unknown';
  const ownerTag = ownerUser
    ? `${ownerUser.username}#${ownerUser.discriminator !== '0' ? ownerUser.discriminator : '0'}`
    : 'Unknown';

  const usersValue = sorted.map(({ user, count }) => {
    const display = user.global_name || user.username;
    const tag = user.discriminator && user.discriminator !== '0'
      ? `${user.username}#${user.discriminator}`
      : `${user.username}#0`;
    return `${count} - @${display} - ${tag}`;
  }).join('\n') || 'Geen berichten';

  const htmlAttachment = new AttachmentBuilder(Buffer.from(buildTranscriptHtml(all, channel), 'utf8'), {
    name: `transcript-${channel.name.replace(/[^\w-]/g, '_')}.html`,
  });

  const transcriptChannel = await channel.client.channels.fetch(TRANSCRIPT_CHANNEL_ID);

  // Send file first to get the CDN URL for the direct link button
  const fileMsg = await transcriptChannel.send({ files: [htmlAttachment] });
  const transcriptUrl = fileMsg.attachments.first()?.url;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .addFields(
      { name: 'Ticket Owner', value: ownerMention, inline: true },
      { name: 'Ticket Name', value: channel.name, inline: true },
      { name: 'Panel Name', value: panel, inline: true },
      { name: 'Users in transcript', value: usersValue },
    )
    .setTimestamp();

  const components = transcriptUrl ? [{
    type: 1,
    components: [{
      type: 2,
      style: 5, // LINK
      label: 'Direct Transcript',
      url: transcriptUrl,
    }],
  }] : [];

  await transcriptChannel.send({ embeds: [embed], components });
}

if (!token) {
  console.error('DISCORD_BOT_TOKEN ontbreekt in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel]
});

let healthTimeout;

client.once(Events.ClientReady, async (c) => {
  console.log(`Bot ingelogd als ${c.user.tag}`);
  try {
    if (process.env.AUTO_DEPLOY_COMMANDS === '1' && clientId && guildId) {
      const rest = new REST({ version: '10' }).setToken(token);
      const { registerCommands } = await import('./commands/index.mjs');
      console.log('Auto-deploying slash commands to guild', guildId);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: registerCommands.map((cmd) => cmd.toJSON()) });
      console.log('Slash commands deployed.');
    }
  } catch (e) {
    console.error('Auto-deploy of slash commands failed:', e?.rawError || e);
  }
  if (isHealthcheck) {
    clearTimeout(healthTimeout);
    console.log('HEALTHCHECK: OK');
    process.exit(0);
  }
  startYesterdayEodScheduler(c);
  console.log('Ready');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    try {
      if (interaction.customId === 'close_ticket') {
        await handleCloseTicket(interaction);
      } else if (interaction.customId === 'close_ticket_staff') {
        await handleCloseTicket(interaction, { staffOnly: true });
      } else if (interaction.customId === 'delete_ticket') {
        await handleDeleteTicket(interaction, postTranscript);
      } else if (isEditBaseId(interaction.customId)) {
        await handleEditButton(interaction);
      } else if (isOpenBaseId(interaction.customId)) {
        await handleOpenButton(interaction);
      }
    } catch (err) {
      console.error('Fout bij button interactie', err);
      const msg = `Er ging iets mis: ${err?.message || err}`;
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: msg }).catch(() => {});
      } else if (!interaction.replied) {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }

  // A modal submission is its own interaction type too, and carries the base
  // id in its custom id -- it arrives with no memory of the message it was
  // opened from.
  if (interaction.isModalSubmit() && isEditBaseId(interaction.customId)) {
    await handleEditModal(interaction).catch(async (err) => {
      console.error('[editbase modal]', err?.message || err);
      const msg = `Er ging iets mis: ${err?.message || err}`;
      if (interaction.deferred) await interaction.editReply({ content: msg }).catch(() => {});
      else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    });
    return;
  }

  // Autocomplete arrives as its own interaction type and must be answered
  // within three seconds, so it is handled before anything heavier. A command
  // without an autocomplete handler gets an empty list rather than silence,
  // which Discord shows as "no options" instead of a spinner that never ends.
  if (interaction.isAutocomplete()) {
    const cmd = registerCommandsMap.get(interaction.commandName);
    if (cmd?.autocomplete) {
      await cmd.autocomplete(interaction).catch((e) => {
        console.error(`[autocomplete] ${interaction.commandName}:`, e?.message || e);
      });
    } else {
      await interaction.respond([]).catch(() => {});
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = registerCommandsMap.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: 'Onbekende command.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    await command.execute(interaction, { clientId, guildId });
  } catch (err) {
    console.error('Fout bij uitvoeren command', err);
    const msg = 'Er ging iets mis.';
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.on('error', (err) => {
  console.error('Discord client error:', err);
});
client.on('shardError', (err, shardId) => {
  console.error('Shard error op shard', shardId, err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise rejection:', err);
  if (isHealthcheck) process.exit(2);
});

if (isHealthcheck) {
  healthTimeout = setTimeout(() => {
    console.error('HEALTHCHECK: TIMEOUT - bot werd niet ready op tijd');
    process.exit(3);
  }, 15000);
}

client.login(token);
