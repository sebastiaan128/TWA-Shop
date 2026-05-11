import { SlashCommandBuilder } from 'discord.js';
import { postYesterdayLeaderboard } from '../lib/daily-eod-post.mjs';

const data = new SlashCommandBuilder()
    .setName('eod-yesterday-test')
    .setDescription('Trigger de yesterday Final EOD post handmatig (admin)')
    .addChannelOption(opt =>
        opt.setName('channel')
            .setDescription('Optioneel: post in dit channel i.p.v. EOD_DAILY_CHANNEL_ID')
            .setRequired(false)
    )
    .addStringOption(opt =>
        opt.setName('date')
            .setDescription('Optioneel: YYYY-MM-DD (legend day) i.p.v. yesterday')
            .setRequired(false)
    );

async function execute(interaction) {
    const requiredRoleId = process.env.SUB_REQUIRED_ROLE_ID;
    if (requiredRoleId) {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const requiredRole = interaction.guild.roles.cache.get(requiredRoleId);
        const hasAccess = requiredRole && member.roles.cache.some(r => r.position >= requiredRole.position);
        if (!hasAccess) {
            return interaction.reply({ content: 'Je hebt niet de juiste rol om dit commando te gebruiken.', ephemeral: true });
        }
    }

    await interaction.deferReply({ ephemeral: true });

    const channelOverride = interaction.options.getChannel('channel')?.id || null;
    const date = interaction.options.getString('date') || null;
    const result = await postYesterdayLeaderboard(interaction.client, { channelOverride, refresh: true, date });

    if (result.ok) {
        const pruned = result.deleted ? ` · ${result.deleted} oude verwijderd` : '';
        return interaction.editReply(`✅ Final post verstuurd in <#${result.channelId}> · snapshot ${result.snapshotDate} · ${result.count} subs${pruned}`);
    }
    return interaction.editReply(`❌ ${result.reason}`);
}

export default { data, execute };
