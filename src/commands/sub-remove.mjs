import { SlashCommandBuilder, MessageFlags } from 'discord.js';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const data = new SlashCommandBuilder()
    .setName('sub-remove')
    .setDescription('Verwijder iemand uit de Legend League sub lijst')
    .addStringOption(opt =>
        opt.setName('name')
            .setDescription('Weergavenaam van de persoon')
            .setRequired(true)
    )
    .addStringOption(opt =>
        opt.setName('month')
            .setDescription('De maand')
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
            return interaction.reply({ content: 'Je hebt niet de juiste rol om dit commando te gebruiken.', flags: MessageFlags.Ephemeral });
        }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = interaction.options.getString('name', true);
    const month = interaction.options.getString('month', true);

    const url = process.env.LEGEND_API_URL;
    const key = process.env.LEGEND_API_KEY;
    if (!url || !key) {
        return interaction.editReply('LEGEND_API_URL of LEGEND_API_KEY ontbreekt in .env');
    }

    const removeUrl = url.replace('/api/legend-subs', '/api/legend-subs/remove');
    try {
        const resp = await fetch(removeUrl, {
            method: 'POST',
            headers: { 'x-api-key': key, 'content-type': 'application/json' },
            body: JSON.stringify({ displayName: name, month }),
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);
        if (!result.removed) {
            return interaction.editReply(`Geen entry gevonden voor **${name}** in **${month}**.`);
        }
    } catch (err) {
        return interaction.editReply(`Fout bij verwijderen: ${err.message}`);
    }

    return interaction.editReply(`🗑️ **${name}** verwijderd uit de **${month}** sub lijst.`);
}

export default { data, execute };
