import { EmbedBuilder } from 'discord.js';

const TWA_COLOR = 0x06b6d4;
const TWA_AUTHOR_ICON = 'https://twabases.com/assets/Logo.png';
const LRM = '‎';

const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const toSuper = (n) => (n == null ? '' : String(n).split('').map((c) => SUP[c] ?? c).join(''));

function stripWideChars(s) {
    return s.replace(/[\p{Extended_Pictographic}‍️​]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

function visualLength(s) {
    return [...s].length;
}

function padEndV(s, n) {
    return s + ' '.repeat(Math.max(0, n - visualLength(s)));
}

function padStartV(s, n) {
    return ' '.repeat(Math.max(0, n - visualLength(s))) + s;
}

// Last Monday of a given UTC year/month (month is 1–12).
function lastMondayOfMonth(year, month) {
    const last = new Date(Date.UTC(year, month, 0));
    const day = last.getUTCDay();
    const back = (day - 1 + 7) % 7;
    last.setUTCDate(last.getUTCDate() - back);
    return last;
}

function seasonInfo(snapshotDateStr) {
    if (!snapshotDateStr) return { seasonId: '—', dayInSeason: 0, seasonLength: 0 };
    const [Y, M, D] = snapshotDateStr.split('-').map(Number);
    const today = new Date(Date.UTC(Y, M - 1, D));
    let seasonEndY = Y, seasonEndM = M;
    let seasonEnd = lastMondayOfMonth(seasonEndY, seasonEndM);
    if (today > seasonEnd) {
        seasonEndM += 1;
        if (seasonEndM === 13) { seasonEndM = 1; seasonEndY += 1; }
        seasonEnd = lastMondayOfMonth(seasonEndY, seasonEndM);
    }
    let prevY = seasonEndY, prevM = seasonEndM - 1;
    if (prevM === 0) { prevM = 12; prevY -= 1; }
    const prevEnd = lastMondayOfMonth(prevY, prevM);
    const day = Math.round((today - prevEnd) / 86400000);
    const length = Math.round((seasonEnd - prevEnd) / 86400000);
    const seasonId = `${seasonEndY}-${String(seasonEndM).padStart(2, '0')}`;
    return { seasonId, dayInSeason: day, seasonLength: length };
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
export { buildYesterdayRankMap };

const AVG_PER_ACTION = 32;

function estimateLostDefenses(p) {
    if (typeof p.lostDefenseCount === 'number') return p.lostDefenseCount;
    const atks = p.dailyAttacks ?? 0;
    const delta = p.todayDelta ?? 0;
    const estLoss = Math.max(0, atks * AVG_PER_ACTION - delta);
    return Math.round(estLoss / AVG_PER_ACTION);
}

const COL = { gain: 5, loss: 5, final: 5 };
const DASH = '—';

function fmtGain(amount, count) {
    if (!(amount > 0)) return DASH;
    return `+${amount}${toSuper(count ?? 0)}`;
}

function fmtLoss(amount, count) {
    if (!(amount > 0)) return DASH;
    return `-${amount}${toSuper(count ?? 0)}`;
}

export function buildEodLines(filtered) {
    const sorted = [...filtered].sort((a, b) => (b.trophies ?? 0) - (a.trophies ?? 0));
    return sorted.map((p) => {
        const atks = p.dailyAttacks ?? 0;
        const lostDefs = estimateLostDefenses(p);
        const hasReal = typeof p.dailyGain === 'number' || typeof p.dailyLoss === 'number';

        let gain;
        let loss;
        if (hasReal) {
            gain = fmtGain(p.dailyGain ?? 0, atks);
            loss = fmtLoss(p.dailyLoss ?? 0, lostDefs);
        } else {
            const delta = p.todayDelta;
            if (delta == null || delta === 0) {
                gain = DASH;
                loss = DASH;
            } else if (delta > 0) {
                gain = fmtGain(delta, atks);
                loss = DASH;
            } else {
                gain = DASH;
                loss = fmtLoss(-delta, lostDefs);
            }
        }

        const final = String(p.trophies ?? 0);
        const name = LRM + (stripWideChars(p.name || p.tag) || p.tag);

        return (
            padStartV(gain, COL.gain) + '  ' +
            padStartV(loss, COL.loss) + '  ' +
            padStartV(final, COL.final) + '  ' +
            name
        );
    });
}

const HEADER =
    '```\n' +
    padStartV('GAIN', COL.gain) + '  ' +
    padStartV('LOSS', COL.loss) + '  ' +
    padStartV('FINAL', COL.final) + '  ' +
    'NAME\n';

function chunkLines(lines, max = 3900) {
    const chunks = [];
    let current = HEADER;
    for (const line of lines) {
        if (current.length + line.length + 1 > max) {
            chunks.push(current);
            current = HEADER;
        }
        current += line + '\n';
    }
    if (current.length > HEADER.length) chunks.push(current);
    return chunks;
}

export function buildEodEmbeds(data, filtered, { title } = {}) {
    const lines = buildEodLines(filtered);
    const dateStr = data.snapshotDate || '—';
    const { seasonId, dayInSeason, seasonLength } = seasonInfo(dateStr);

    const chunks = chunkLines(lines).map((c) => c + '```');

    const head = new EmbedBuilder()
        .setAuthor({ name: 'TWA', iconURL: TWA_AUTHOR_ICON })
        .setTitle(title || 'Legend League Attacks')
        .setDescription(chunks[0] || '_Geen spelers in de snapshot._')
        .setColor(TWA_COLOR)
        .setFooter({ text: `End of Day ${dayInSeason}/${seasonLength} (${seasonId})` });

    const embeds = [head];
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
