import { EmbedBuilder } from 'discord.js';

const TWA_COLOR = 0x06b6d4;
const TWA_AUTHOR_ICON = 'https://twabases.com/assets/Logo.png';
const TWA_THUMB = 'https://twabases.com/assets/TWACUP.png';

const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const toSuper = (n) => (n == null ? '' : String(n).split('').map((c) => SUP[c] ?? c).join(''));

function fmtDelta(d) {
    if (d == null) return '   · ';
    if (d > 0) return `+${d}`;
    if (d < 0) return `${d}`;
    return '·0';
}

function rankMedal(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `\`#${String(rank).padStart(2, ' ')}\``;
}

function movementBadge(prevRank, currentRank) {
    if (prevRank == null) return '🆕';
    const diff = prevRank - currentRank;
    if (diff > 0) return `🔺${diff}`;
    if (diff < 0) return `🔻${-diff}`;
    return '➖';
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
        const medal = rankMedal(p.rank);
        const move = movementBadge(yMap.get(p.tag), p.rank).padEnd(4, ' ');
        const trophies = String(p.trophies ?? 0).padStart(5, ' ');
        const delta = fmtDelta(p.todayDelta).padStart(5, ' ');
        const ad = `${toSuper(p.dailyAttacks ?? 0)}⁄${toSuper(p.dailyDefenses ?? 0)}`;
        const name = (p.name || p.tag).slice(0, 18);
        const clan = p.clan?.name ? ` · \`${p.clan.name.slice(0, 10)}\`` : '';
        return `${medal} \`${move}\` \`${trophies}🏆\` \`${delta}\` \`${ad}\` **${name}**${clan}`;
    });
}

function chunkLines(lines, max = 3800) {
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
    const chunks = chunkLines(lines);
    const dateStr = data.snapshotDate || '—';

    const header = new EmbedBuilder()
        .setAuthor({ name: 'TWA · Legend League', iconURL: TWA_AUTHOR_ICON })
        .setTitle(title || `🏆 End of Day · ${dateStr}`)
        .setThumbnail(TWA_THUMB)
        .setDescription(chunks[0] || '_Geen spelers in de snapshot._')
        .setFooter({ text: `${filtered.length} subs · rank · Δrank · 🏆 · Δtoday · atk⁄def · clan`, iconURL: TWA_AUTHOR_ICON })
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
