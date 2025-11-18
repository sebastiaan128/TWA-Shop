import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('role')
  .setDescription('Kent een vaste role toe aan jezelf');

async function execute(interaction) {
  const roleId = process.env.ROLE_ID_TO_ASSIGN;
  if (!roleId) {
    return interaction.reply({ content: 'ROLE_ID_TO_ASSIGN ontbreekt in .env', flags: 64 });
  }
  const guild = interaction.guild;
  const me = guild.members.me;
  if (!me) {
    return interaction.reply({ content: 'Kan eigen bot member niet ophalen.', flags: 64 });
  }
  const hasManage = me.permissions.has(PermissionFlagsBits.ManageRoles);
  if (!hasManage) {
    return interaction.reply({ content: 'Bot mist permissie: Manage Roles.', flags: 64 });
  }
  await guild.roles.fetch();
  const targetRole = guild.roles.cache.get(roleId);
  if (!targetRole) {
    return interaction.reply({ content: 'Role niet gevonden in deze guild.', flags: 64 });
  }
  const botHighest = me.roles.highest;
  if (botHighest && botHighest.comparePositionTo(targetRole) <= 0) {
    return interaction.reply({ content: 'Bot role staat niet boven de target role. Verplaats de bot role boven de gewenste role.', flags: 64 });
  }
  const member = await guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(roleId)) {
    return interaction.reply({ content: 'Je hebt deze role al.', flags: 64 });
  }
  try {
    await member.roles.add(roleId, 'Self-assign via /role');
    return interaction.reply({ content: `Role ${targetRole.name} toegevoegd!`, flags: 64 });
  } catch (e) {
    console.error('Fout bij toevoegen role', e);
    return interaction.reply({ content: `Kon role niet toevoegen: ${e.code === 50013 ? 'Missing Permissions' : 'Onbekende fout'}`, flags: 64 });
  }
}

export default { data, execute };
