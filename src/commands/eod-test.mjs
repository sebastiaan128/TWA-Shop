import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { requireStaff } from '../lib/staff-gate.mjs';
import { postDailyLeaderboard } from '../lib/daily-eod-post.mjs';

const data = new SlashCommandBuilder()
    .setName('eod-test')
    // Test/debug tool: hidden from regular members by default. Server admins
    // can grant it to a role in Server Settings -> Integrations.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDescription('Trigger de dagelijkse EOD post handmatig (admin)')
    .addChannelOption(opt =>
        opt.setName('channel')
            .setDescription('Optioneel: post in dit channel i.p.v. EOD_DAILY_CHANNEL_ID')
            .setRequired(false)
    );

async function execute(interaction) {
    // Fails closed: a missing SUB_REQUIRED_ROLE_ID used to skip the check and
    // open these commands -- /sub-add grants paid Legend access -- to everyone.
    if (!(await requireStaff(interaction, { roleEnv: 'SUB_REQUIRED_ROLE_ID' }))) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channelOverride = interaction.options.getChannel('channel')?.id || null;
    const result = await postDailyLeaderboard(interaction.client, { channelOverride, refresh: true });

    if (result.ok) {
        const pruned = result.deleted ? ` · ${result.deleted} oude verwijderd` : '';
        return interaction.editReply(`✅ Post verstuurd in <#${result.channelId}> · snapshot ${result.snapshotDate} · ${result.count} subs${pruned}`);
    }
    return interaction.editReply(`❌ ${result.reason}`);
}

export default { data, execute };
