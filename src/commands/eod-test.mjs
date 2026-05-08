import { SlashCommandBuilder } from 'discord.js';
import { postDailyLeaderboard } from '../lib/daily-eod-post.mjs';

const data = new SlashCommandBuilder()
    .setName('eod-test')
    .setDescription('Trigger de dagelijkse EOD post handmatig (admin)')
    .addChannelOption(opt =>
        opt.setName('channel')
            .setDescription('Optioneel: post in dit channel i.p.v. EOD_DAILY_CHANNEL_ID')
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
    const result = await postDailyLeaderboard(interaction.client, { channelOverride });

    if (result.ok) {
        return interaction.editReply(`✅ Post verstuurd in <#${result.channelId}> · snapshot ${result.snapshotDate} · ${result.count} subs`);
    }
    return interaction.editReply(`❌ ${result.reason}`);
}

export default { data, execute };
