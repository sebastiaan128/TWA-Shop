import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Partials, Events, REST, Routes } from 'discord.js';
import { registerCommandsMap } from './commands/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const isHealthcheck = !!process.env.HEALTHCHECK;

if (!token) {
  console.error('DISCORD_BOT_TOKEN ontbreekt in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
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
