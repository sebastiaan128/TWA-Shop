import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { requireStaff } from '../lib/staff-gate.mjs';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function buildMonthChoices() {
    const now = new Date();
    // Include some past months so admins can remove subs from finished seasons.
    return Array.from({ length: 18 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1);
        const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
        return { name: label, value: label };
    });
}

const MONTHS = buildMonthChoices();

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
            .addChoices(...MONTHS)
    )
    .addUserOption(opt =>
        opt.setName('user')
            .setDescription('Discord gebruiker (optioneel)')
            .setRequired(false)
    );

async function execute(interaction) {
    // Fails closed: a missing SUB_REQUIRED_ROLE_ID used to skip the check and
    // open these commands -- /sub-add grants paid Legend access -- to everyone.
    if (!(await requireStaff(interaction, { roleEnv: 'SUB_REQUIRED_ROLE_ID' }))) return;

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
