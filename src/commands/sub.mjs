import { SlashCommandBuilder } from 'discord.js';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const data = new SlashCommandBuilder()
    .setName('sub')
    .setDescription('Bekijk wie een Legend League sub heeft gekocht voor een specifieke maand')
    .addStringOption(opt =>
        opt.setName('month')
            .setDescription('De maand om op te zoeken')
            .setRequired(true)
            .addChoices(...MONTHS.map(m => ({ name: m, value: m })))
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
    const month = interaction.options.getString('month', true);
    const url = process.env.LEGEND_API_URL;
    const key = process.env.LEGEND_API_KEY;
    if (!url || !key) {
        return interaction.editReply('LEGEND_API_URL of LEGEND_API_KEY ontbreekt in .env');
    }
    let result;
    try {
        const resp = await fetch(`${url}?month=${month}`, { headers: { 'x-api-key': key } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        result = await resp.json();
    } catch (err) {
        return interaction.editReply(`Fout bij ophalen data: ${err.message}`);
    }
    if (result.count === 0) {
        return interaction.editReply(`Niemand heeft een Legend League sub gekocht voor **${month}**.`);
    }
    const header = `**Legend League subs — ${month}** (${result.count})\n`;
    const lines = result.buyers.map((b, i) => `${i + 1}. ${b.username}`);

    const chunks = [];
    let current = header;
    for (const line of lines) {
        if (current.length + line.length + 1 > 1900) {
            chunks.push(current);
            current = '';
        }
        current += line + '\n';
    }
    if (current) chunks.push(current);

    await interaction.editReply(chunks[0]);
    for (const chunk of chunks.slice(1)) {
        await interaction.followUp({ content: chunk, ephemeral: true });
    }
}

export default { data, execute };
