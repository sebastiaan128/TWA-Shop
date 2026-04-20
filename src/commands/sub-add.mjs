import { SlashCommandBuilder } from 'discord.js';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const data = new SlashCommandBuilder()
    .setName('sub-add')
    .setDescription('Voeg iemand handmatig toe aan de Legend League sub lijst')
    .addStringOption(opt =>
        opt.setName('name')
            .setDescription('Weergavenaam van de persoon')
            .setRequired(true)
    )
    .addStringOption(opt =>
        opt.setName('month')
            .setDescription('De maand waarvoor ze een sub hebben')
            .setRequired(true)
            .addChoices(...MONTHS.map(m => ({ name: m, value: m })))
    )
    .addUserOption(opt =>
        opt.setName('user')
            .setDescription('Discord gebruiker (optioneel)')
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

    const displayName = interaction.options.getString('name', true);
    const month = interaction.options.getString('month', true);
    const targetUser = interaction.options.getUser('user');

    const url = process.env.LEGEND_API_URL;
    const key = process.env.LEGEND_API_KEY;
    if (!url || !key) {
        return interaction.editReply('LEGEND_API_URL of LEGEND_API_KEY ontbreekt in .env');
    }

    // POST to /api/legend-subs/add
    const addUrl = url.replace('/api/legend-subs', '/api/legend-subs/add');
    try {
        const resp = await fetch(addUrl, {
            method: 'POST',
            headers: { 'x-api-key': key, 'content-type': 'application/json' },
            body: JSON.stringify({
                displayName,
                month,
                discordUserId: targetUser?.id || null,
                addedBy: interaction.user.id,
            }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }
    } catch (err) {
        return interaction.editReply(`Fout bij toevoegen: ${err.message}`);
    }

    const mention = targetUser ? ` (${targetUser.toString()})` : '';
    return interaction.editReply(`✅ **${displayName}**${mention} toegevoegd aan de **${month}** sub lijst.`);
}

export default { data, execute };
