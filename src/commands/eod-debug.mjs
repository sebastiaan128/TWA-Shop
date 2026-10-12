import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { requireStaff } from '../lib/staff-gate.mjs';
import { fetchEodSnapshot } from '../lib/eod-leaderboard.mjs';

const data = new SlashCommandBuilder()
    .setName('eod-debug')
    // Test/debug tool: hidden from regular members by default. Server admins
    // can grant it to a role in Server Settings -> Integrations.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDescription('Check waarom een speler wel/niet in de EOD leaderboard staat (admin)')
    .addStringOption(opt =>
        opt.setName('name')
            .setDescription('Naam (gedeeltelijk) om te zoeken')
            .setRequired(true)
    );

async function execute(interaction) {
    // Fails closed: a missing SUB_REQUIRED_ROLE_ID used to skip the check and
    // open these commands -- /sub-add grants paid Legend access -- to everyone.
    if (!(await requireStaff(interaction, { roleEnv: 'SUB_REQUIRED_ROLE_ID' }))) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const query = interaction.options.getString('name', true).toLowerCase();
    const eodRoleId = process.env.EOD_REQUIRED_ROLE_ID;

    const data = await fetchEodSnapshot({ refresh: true });
    if (!data?.ok) return interaction.editReply(`API failed: ${data?.error || 'unknown'}`);

    // Players from today's snapshot include those filtered to Legend League.
    // To find someone who DIDN'T make it through the filter we need raw list,
    // but the API only returns ranked filtered players. Search there.
    const matches = (data.players || []).filter((p) =>
        (p.name || '').toLowerCase().includes(query)
        || (p.tag || '').toLowerCase().includes(query)
    );

    if (!matches.length) {
        return interaction.editReply(
            `❌ Geen match voor "${query}" in vandaag's snapshot (${data.snapshotDate}).\n` +
            `Mogelijke oorzaken:\n` +
            `• CoC tag niet gelinkt op de site\n` +
            `• Niet in Legend League (leagueTier.id ≠ 105000036)\n` +
            `• Snapshot fetch faalde voor deze speler\n` +
            `Snapshot bevat ${data.players.length} legend-league spelers totaal.`
        );
    }

    const lines = [];
    for (const p of matches) {
        let roleStatus = '?';
        if (p.discordUserId && eodRoleId) {
            try {
                const m = await interaction.guild.members.fetch(p.discordUserId);
                roleStatus = m.roles.cache.has(eodRoleId) ? '✅ heeft EOD role' : '❌ heeft GEEN EOD role';
            } catch {
                roleStatus = '⚠️ kon Discord member niet ophalen';
            }
        } else if (!p.discordUserId) {
            roleStatus = '❌ geen Discord-link (CoC tag niet aan account gekoppeld)';
        }

        lines.push(
            `**${p.name}** \`${p.tag}\`\n` +
            `  rank #${p.rank} · ${p.trophies} 🏆\n` +
            `  league: ${p.league?.name || '-'} (id ${p.league?.id ?? '-'})\n` +
            `  discordUserId: \`${p.discordUserId || '(none)'}\`\n` +
            `  role: ${roleStatus}\n` +
            `  todayDelta: ${p.todayDelta ?? '-'} · attacks: ${p.dailyAttacks ?? '-'} · defWins: ${p.dailyDefenses ?? '-'}\n` +
            `  dailyGain: ${p.dailyGain ?? '-'} · dailyLoss: ${p.dailyLoss ?? '-'} · attackCount: ${p.attackCount ?? '-'} · lostDefenseCount: ${p.lostDefenseCount ?? '-'}`
        );
    }

    return interaction.editReply(lines.join('\n\n').slice(0, 1900));
}

export default { data, execute };
