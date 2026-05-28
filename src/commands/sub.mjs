import { SlashCommandBuilder, MessageFlags } from 'discord.js';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function buildMonthChoices() {
    const now = new Date();
    return Array.from({ length: 18 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1);
        const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
        return { name: label, value: label };
    });
}

const MONTHS = buildMonthChoices();

const data = new SlashCommandBuilder()
    .setName('sub')
    .setDescription('Bekijk wie een Legend League sub heeft gekocht voor een specifieke maand')
    .addStringOption(opt =>
        opt.setName('month')
            .setDescription('De maand om op te zoeken')
            .setRequired(true)
            .addChoices(...MONTHS)
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
    const month = interaction.options.getString('month', true);
    const url = process.env.LEGEND_API_URL;
    const key = process.env.LEGEND_API_KEY;
    if (!url || !key) {
        return interaction.editReply('LEGEND_API_URL of LEGEND_API_KEY ontbreekt in .env');
    }
    let result;
    try {
        const resp = await fetch(`${url}?month=${encodeURIComponent(month)}`, { headers: { 'x-api-key': key } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        result = await resp.json();
    } catch (err) {
        return interaction.editReply(`Fout bij ophalen data: ${err.message}`);
    }
    if (result.count === 0) {
        return interaction.editReply(`Niemand heeft een Legend League sub gekocht voor **${month}**.`);
    }

    // Bulk-fetch live Discord usernames (fixes old entries that only stored displayName)
    const userIds = [...new Set(result.buyers.filter(b => b.discordUserId).map(b => b.discordUserId))];
    const memberMap = new Map();
    if (userIds.length > 0) {
        try {
            const fetched = await interaction.guild.members.fetch({ user: userIds });
            fetched.forEach(m => memberMap.set(m.id, m.user.username));
        } catch { /* fall back to stored name */ }
    }

    const header = `**Legend League subs — ${month}** (${result.count})\n`;
    const lines = result.buyers.map((b, i) => {
        const name = (b.discordUserId && memberMap.get(b.discordUserId)) || b.username;
        return `${i + 1}. ${name}`;
    });

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
        await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral });
    }
}

export default { data, execute };
