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
    const lines = result.buyers.map((b, i) => `${i + 1}. **${b.displayName}**`);
    return interaction.editReply(`**Legend League subs — ${month}** (${result.count})\n${lines.join('\n')}`);
}

export default { data, execute };
