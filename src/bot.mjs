import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Partials, Events, REST, Routes, EmbedBuilder } from 'discord.js';
import { generateFromMessages } from 'discord-html-transcripts';
import { registerCommandsMap } from './commands/index.mjs';

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
  // Fetch all messages (paginated)
  const all = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    const arr = [...batch.values()];
    all.push(...arr);
    before = arr.at(-1).id;
    if (batch.size < 100) break;
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
    const display = user.globalName || user.username;
    const tag = user.discriminator && user.discriminator !== '0'
      ? `${user.username}#${user.discriminator}`
      : `${user.username}#0`;
    return `${count} - @${display} - ${tag}`;
  }).join('\n') || 'Geen berichten';

  // Generate HTML transcript
  const htmlAttachment = await generateFromMessages(all, channel, {
    filename: `transcript-${channel.name.replace(/[^\w-]/g, '_')}.html`,
    saveImages: false,
    poweredBy: false,
    footerText: 'Exported {number} message{s}',
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
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    try {
      if (interaction.customId === 'close_ticket') {
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.channel;

        // Deny SEND_MESSAGES for @everyone to lock the channel
        await channel.permissionOverwrites.edit(interaction.guildId, {
          SendMessages: false,
        });

        // Disable the close button on the original message
        await interaction.message.edit({ components: [{
          type: 1,
          components: [{
            type: 2,
            style: 2,
            label: 'Ticket Closed',
            emoji: { name: '🔒' },
            custom_id: 'close_ticket',
            disabled: true,
          }],
        }] });

        // Send a locked message with a delete button
        await channel.send({
          content: `🔒 Ticket gesloten door <@${interaction.user.id}>`,
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 4,
              label: 'Delete Ticket',
              emoji: { name: '🗑️' },
              custom_id: 'delete_ticket',
            }],
          }],
        });

        await interaction.editReply({ content: 'Ticket gesloten.' });
      } else if (interaction.customId === 'delete_ticket') {
        await interaction.deferReply({ ephemeral: true });
        await postTranscript(interaction.channel);
        await interaction.channel.delete();
      }
    } catch (err) {
      console.error('Fout bij button interactie', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Er ging iets mis.', ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = registerCommandsMap.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: 'Onbekende command.', ephemeral: true });
    return;
  }
  try {
    await command.execute(interaction, { clientId, guildId });
  } catch (err) {
    console.error('Fout bij uitvoeren command', err);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: 'Er ging iets mis.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Er ging iets mis.', ephemeral: true });
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
