import { EmbedBuilder } from 'discord.js';

const TWA_COLOR = 0x06b6d4;
const TWA_AUTHOR_ICON = 'https://twabases.com/assets/Logo.png';

function fmtMove(prevRank, currentRank) {
    if (prevRank == null) return 'NEW';
    const diff = prevRank - currentRank;
    if (diff > 0) return `▲ ${diff}`;
    if (diff < 0) return `▼ ${-diff}`;
    return '= 0';
}

function fmtSigned(d) {
    if (d == null) return '   —';
    if (d > 0) return `+${d}`.padStart(4, ' ');
    return `${d}`.padStart(4, ' ');
}

function buildYesterdayRankMap(players) {
    const withYesterday = players
        .map((p) => {
            const h = p.history || [];
            const y = h.length >= 2 ? h[h.length - 2] : null;
            return y && typeof y.trophies === 'number'
                ? { tag: p.tag, trophies: y.trophies }
                : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.trophies - a.trophies);
    const map = new Map();
    withYesterday.forEach((p, i) => map.set(p.tag, i + 1));
    return map;
}

export function buildEodLines(filtered) {
    const yMap = buildYesterdayRankMap(filtered);

    return filtered.map((p) => {
        const rank = `**${p.rank}.**`;
        const name = p.name || p.tag;
        const trophies = `\`${p.trophies ?? 0}\``;
        const delta = `\`${fmtSigned(p.todayDelta).trim()}\``;
        const move = `\`${fmtMove(yMap.get(p.tag), p.rank).trim()}\``;
        return `${rank}  ${name}  —  ${trophies} · ${delta} · ${move}`;
    });
}

function chunkLines(lines, max = 3900) {
    const chunks = [];
    let current = '';
    for (const line of lines) {
        if (current.length + line.length + 1 > max) {
            chunks.push(current);
            current = '';
        }
        current += line + '\n';
    }
    if (current) chunks.push(current);
    return chunks;
}

export function buildEodEmbeds(data, filtered, { title } = {}) {
    const lines = buildEodLines(filtered);
    const dateStr = data.snapshotDate || '—';

    const chunks = chunkLines(lines);

    const header = new EmbedBuilder()
        .setAuthor({ name: 'TWA  ·  Legend League', iconURL: TWA_AUTHOR_ICON })
        .setTitle(title || `End of Day  ·  ${dateStr}`)
        .setDescription(chunks[0] || '_Geen spelers in de snapshot._')
        .setColor(TWA_COLOR)
        .setTimestamp();

    const embeds = [header];
    for (let i = 1; i < chunks.length; i++) {
        embeds.push(new EmbedBuilder().setDescription(chunks[i]).setColor(TWA_COLOR));
    }
    return embeds;
}

export async function fetchEodSnapshot() {
    const url = process.env.EOD_API_URL;
    const key = process.env.EOD_API_KEY;
    if (!url || !key) throw new Error('EOD_API_URL or EOD_API_KEY missing');
    const resp = await fetch(url, { headers: { 'x-api-key': key } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}

export async function filterActiveSubs(guild, players, requiredRoleId) {
    const userIds = [...new Set(players.map((p) => p.discordUserId).filter(Boolean))];
    if (!userIds.length) return [];
    const fetched = await guild.members.fetch({ user: userIds });
    const roleMemberIds = new Set();
    fetched.forEach((m) => {
        if (m.roles.cache.has(requiredRoleId)) roleMemberIds.add(m.id);
    });
    return players
        .filter((p) => p.discordUserId && roleMemberIds.has(p.discordUserId))
        .map((p, i) => ({ ...p, rank: i + 1 }));
}
