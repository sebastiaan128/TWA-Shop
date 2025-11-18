import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Controleert of de bot reageert');

async function execute(interaction) {
  await interaction.reply({ content: 'Pong!' });
  const sent = await interaction.fetchReply();
  const diff = sent.createdTimestamp - interaction.createdTimestamp;
  await interaction.editReply(`Pong! Latency: ${diff}ms`);
}

export default { data, execute };
