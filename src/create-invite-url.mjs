import 'dotenv/config';
import { PermissionFlagsBits } from 'discord.js';

const clientId = process.env.DISCORD_CLIENT_ID;
if (!clientId) {
  console.error('DISCORD_CLIENT_ID ontbreekt');
  process.exit(1);
}

// Rechten: bot heeft nodig: ManageRoles om role te kunnen toekennen
const permissions = BigInt(PermissionFlagsBits.ManageRoles | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel);
const scope = 'bot%20applications.commands';
const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scope}`;
console.log(url);

