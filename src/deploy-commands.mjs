import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { registerCommands } from './commands/index.mjs';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID of DISCORD_GUILD_ID ontbreekt. Zet deze in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Publiceren van slash commands...');
    const body = registerCommands.map((c) => c.toJSON());
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log('Slash commands gepubliceerd voor guild', guildId);
  } catch (error) {
    console.error('Fout bij deployen van commands:', error?.rawError ?? error);
    process.exit(1);
  }
})();

