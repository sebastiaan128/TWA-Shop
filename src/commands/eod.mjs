import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { buildEodMessages, fetchEodSnapshot, filterActiveSubs } from '../lib/eod-leaderboard.mjs';

const TAG_RE = /^#[0-9A-Z]{3,12}$/;

function normaliseTag(raw) {
    if (!raw) return null;
    const cleaned = raw.toString().trim().toUpperCase().replace(/O/g, '0');
    const withHash = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
    return TAG_RE.test(withHash) ? withHash : null;
}

async function executeLeaderboard(interaction) {
    await interaction.deferReply();

    const requiredRoleId = process.env.EOD_REQUIRED_ROLE_ID;
    if (!requiredRoleId) {
        return interaction.editReply('EOD_REQUIRED_ROLE_ID missing in .env');
    }

    let data;
    try {
        data = await fetchEodSnapshot();
    } catch (err) {
        return interaction.editReply(`Failed to fetch leaderboard: ${err.message}`);
    }

    if (!data?.ok || !data.players?.length) {
        return interaction.editReply('No snapshot available yet — the first snapshot appears after the next 05:15 UTC reset.');
    }

    let filtered;
    try {
        filtered = await filterActiveSubs(interaction.guild, data.players, requiredRoleId);
    } catch (err) {
        return interaction.editReply(`Failed to fetch role members: ${err.message}`);
    }

    if (!filtered.length) {
        return interaction.editReply('No active subs with a linked CoC tag in the current snapshot.');
    }

    const messages = buildEodMessages(data, filtered);
    await interaction.editReply({ content: messages[0] });
    for (let i = 1; i < messages.length; i++) {
        await interaction.followUp({ content: messages[i] });
    }
}

async function executePlayer(interaction) {
    await interaction.deferReply();

    const tag = normaliseTag(interaction.options.getString('tag', true));
    if (!tag) return interaction.editReply('Invalid tag. Use e.g. `#2PP` or `2PP`.');

    const url = process.env.EOD_PLAYER_API_URL;
    const key = process.env.EOD_API_KEY;
    if (!url || !key) {
        return interaction.editReply('EOD_PLAYER_API_URL or EOD_API_KEY missing in .env');
    }

    let data;
    try {
        const resp = await fetch(`${url}?tag=${encodeURIComponent(tag)}`, { headers: { 'x-api-key': key } });
        if (resp.status === 404) {
            return interaction.editReply(`No history for \`${tag}\`.`);
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        data = await resp.json();
    } catch (err) {
        return interaction.editReply(`Failed to fetch player: ${err.message}`);
    }

    const history = data.history || [];
    if (!history.length) return interaction.editReply(`No history for \`${tag}\`.`);

    const recent = history.slice(-14);
    const lines = recent.map((h, i) => {
        const prev = i > 0 ? recent[i - 1].trophies : null;
        const delta = prev != null ? h.trophies - prev : null;
        const d = delta == null ? '    ' : (delta > 0 ? `+${delta}` : `${delta}`).padStart(4, ' ');
        return `\`${h.date}\` \`${String(h.trophies).padStart(5, ' ')}🏆\` \`${d}\``;
    });

    const embed = new EmbedBuilder()
        .setTitle(`${data.name || tag} · ${tag}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Current: ${data.currentTrophies}🏆${data.clan?.name ? ` · ${data.clan.name}` : ''}` })
        .setColor(0x06b6d4);

    return interaction.editReply({ embeds: [embed] });
}

const data = new SlashCommandBuilder()
    .setName('eod')
    .setDescription('Legend League End-of-Day rankings')
    .addSubcommand((s) =>
        s.setName('leaderboard').setDescription('Show the current EOD leaderboard of active subs')
    )
    .addSubcommand((s) =>
        s.setName('player')
            .setDescription('Show trophy history of a player')
            .addStringOption((o) =>
                o.setName('tag').setDescription('CoC player tag (e.g. #2PP)').setRequired(true)
            )
    );

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'leaderboard') return executeLeaderboard(interaction);
    if (sub === 'player') return executePlayer(interaction);
    return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
}

export default { data, execute };
