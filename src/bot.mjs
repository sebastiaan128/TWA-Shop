import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import { registerCommandsMap } from './commands/index.mjs';

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

client.once(Events.ClientReady, (c) => {
  console.log(`Bot ingelogd als ${c.user.tag}`);
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
