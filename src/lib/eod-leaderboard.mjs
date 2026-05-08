import { EmbedBuilder } from 'discord.js';

const TWA_COLOR = 0x06b6d4;
const TWA_AUTHOR_ICON = 'https://twabases.com/assets/Logo.png';

function fmtMove(prevRank, currentRank) {
    if (prevRank == null) return 'NEW';
    const diff = prevRank - currentRank;
    if (diff > 0) return `+${diff}`;
    if (diff < 0) return `${diff}`;
    return '  =';
}

function fmtDelta(d) {
    if (d == null) return '    ';
    if (d > 0) return `+${d}`;
    return `${d}`;
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

    const widths = {
        name: Math.min(20, Math.max(...filtered.map((p) => (p.name || p.tag).length))),
        clan: Math.min(15, Math.max(0, ...filtered.map((p) => p.clan?.name?.length || 0))),
    };

    return filtered.map((p) => {
        const rank = String(p.rank).padStart(2, ' ');
        const move = fmtMove(yMap.get(p.tag), p.rank).padStart(4, ' ');
        const trophies = String(p.trophies ?? 0).padStart(5, ' ');
        const delta = fmtDelta(p.todayDelta).padStart(5, ' ');
        const ad = `${p.dailyAttacks ?? 0}/${p.dailyDefenses ?? 0}`.padStart(4, ' ');
        const name = (p.name || p.tag).slice(0, widths.name).padEnd(widths.name, ' ');
        const clan = (p.clan?.name || '').slice(0, widths.clan).padEnd(widths.clan, ' ');
        return `${rank}  ${move}  ${trophies}  ${delta}  ${ad}  ${name}  ${clan}`;
    });
}

function chunkLines(lines, header, max = 3900) {
    const chunks = [];
    let current = header;
    for (const line of lines) {
        if (current.length + line.length + 1 > max) {
            chunks.push(current);
            current = header;
        }
        current += line + '\n';
    }
    if (current.trim().length > header.trim().length) chunks.push(current);
    return chunks;
}

export function buildEodEmbeds(data, filtered, { title } = {}) {
    const lines = buildEodLines(filtered);
    const dateStr = data.snapshotDate || '—';

    const widths = {
        name: Math.min(20, Math.max(...filtered.map((p) => (p.name || p.tag).length))),
        clan: Math.min(15, Math.max(0, ...filtered.map((p) => p.clan?.name?.length || 0))),
    };
    const headerLine =
        '```ansi\n' +
        '[1;36m' +
        ' #    Δr   troph    today  a/d   ' +
        'player'.padEnd(widths.name, ' ') + '  ' +
        'clan'.padEnd(widths.clan, ' ') + '[0m\n';

    const chunks = chunkLines(lines, headerLine);
    const closed = chunks.map((c) => c + '```');

    const header = new EmbedBuilder()
        .setAuthor({ name: 'TWA · Legend League', iconURL: TWA_AUTHOR_ICON })
        .setTitle(title || `End of Day — ${dateStr}`)
        .setDescription(closed[0] || '_Geen spelers in de snapshot._')
        .setColor(TWA_COLOR)
        .setTimestamp();

    const embeds = [header];
    for (let i = 1; i < closed.length; i++) {
        embeds.push(new EmbedBuilder().setDescription(closed[i]).setColor(TWA_COLOR));
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
