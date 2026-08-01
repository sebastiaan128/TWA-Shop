import { MessageFlags } from 'discord.js';

/**
 * Role gate for staff-only commands.
 *
 * Matches the check already used by the eod commands: a member passes if they
 * hold any role at or above the required role's position. Positional rather
 * than an exact match on purpose -- the roles ABOVE the required one are the
 * more senior ones, so they get access without anyone having to also grant
 * them the lower role.
 *
 * Fails CLOSED when no role is configured. The eod commands fail open (skip the
 * check entirely if the env var is missing), which is tolerable for reading a
 * leaderboard but not for writing to the base library -- a missing env var
 * should not silently open a write command to the whole server.
 */
export async function requireStaff(interaction, { roleEnv = 'SUB_REQUIRED_ROLE_ID' } = {}) {
  const requiredRoleId = process.env[roleEnv];

  if (!requiredRoleId) {
    await interaction.reply({
      content: `This command is not configured yet: \`${roleEnv}\` is missing. Ask an admin to set it.`,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command only works inside the server.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const requiredRole = interaction.guild.roles.cache.get(requiredRoleId);
    const hasAccess = requiredRole && member.roles.cache.some((r) => r.position >= requiredRole.position);
    if (!hasAccess) {
      await interaction.reply({
        content: 'You do not have the right role to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }
    return true;
  } catch (e) {
    console.error('[staff-gate] member fetch failed', e?.message || e);
    await interaction.reply({
      content: 'Could not check your roles. Try again in a moment.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
}
