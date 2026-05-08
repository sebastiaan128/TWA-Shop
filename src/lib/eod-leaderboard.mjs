const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function sup(n) {
    return String(n ?? 0).split('').map((c) => SUP[+c] ?? c).join('');
}

function stripWideChars(s) {
    return s.replace(/[\p{Extended_Pictographic}‍️​]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

// Last Monday of a given UTC year/month (month is 1–12).
function lastMondayOfMonth(year, month) {
    const last = new Date(Date.UTC(year, month, 0));
    const day = last.getUTCDay();
    const back = (day - 1 + 7) % 7;
    last.setUTCDate(last.getUTCDate() - back);
    return last;
}

export function seasonInfo(snapshotDateStr) {
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

const AVG_PER_ACTION = 32;

function fmtGain(p) {
    const atks = p.dailyAttacks ?? 0;
    if (typeof p.dailyGain === 'number') {
        return p.dailyGain > 0 ? `+${p.dailyGain}${sup(atks)}` : '—';
    }
    const d = p.todayDelta;
    return typeof d === 'number' && d > 0 ? `+${d}${sup(atks)}` : '—';
}

function fmtLoss(p) {
    const atks = p.dailyAttacks ?? 0;
    const lostDefs = typeof p.lostDefenseCount === 'number'
        ? p.lostDefenseCount
        : Math.max(0, Math.round((atks * AVG_PER_ACTION - (p.todayDelta ?? 0)) / AVG_PER_ACTION));
    if (typeof p.dailyLoss === 'number') {
        return p.dailyLoss > 0 ? `-${p.dailyLoss}${sup(lostDefs)}` : '—';
    }
    const d = p.todayDelta;
    return typeof d === 'number' && d < 0 ? `${d}${sup(lostDefs)}` : '—';
}

const COL_GAIN = 9;
const COL_LOSS = 9;
const COL_FINAL = 7;

// Pad a value to a column width. Superscript chars count as length-1 in JS
// but render slightly wider, so add 1 extra trailing space if value has any.
function padCell(value, width) {
    const hasSup = /[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(value);
    const v = hasSup ? value + ' ' : value;
    return v.padEnd(width);
}

export function buildEodMessages(data, filtered, { title = 'TWA Legend League', clanTag = '' } = {}) {
    const sorted = [...filtered].sort((a, b) => (b.trophies ?? 0) - (a.trophies ?? 0));
    const { seasonId, dayInSeason, seasonLength } = seasonInfo(data.snapshotDate);

    const headerLine =
        'GAIN'.padEnd(COL_GAIN) +
        'LOSS'.padEnd(COL_LOSS) +
        'FINAL'.padEnd(COL_FINAL) +
        'NAME';

    const rows = sorted.map((p, i) => {
        const gain = fmtGain(p);
        const loss = fmtLoss(p);
        const final = String(p.trophies ?? 0);
        const name = stripWideChars(p.name || p.tag) || p.tag;
        const star = i === 0 ? ' ★' : '';
        return (
            padCell(gain, COL_GAIN) +
            padCell(loss, COL_LOSS) +
            final.padEnd(COL_FINAL) +
            name + star
        );
    });

    const titleLine = `🏆 ${title}${clanTag ? ` (${clanTag})` : ''}`;
    const subtitleLine = `Legend League Attacks · End of Day ${dayInSeason}/${seasonLength} · ${seasonId}`;
    const footerLine = `End of Day ${dayInSeason}/${seasonLength} (${seasonId})`;

    // Discord hard message limit is 2000 chars. Split rows into chunks if needed.
    const messages = [];
    const wrapBody = (bodyRows) =>
        '```\n' + headerLine + '\n' + bodyRows.join('\n') + '\n```';

    let currentRows = [];
    let currentLen = wrapBody([]).length;

    for (const row of rows) {
        const projected = currentLen + row.length + 1;
        if (projected > 1800 && currentRows.length) {
            messages.push(wrapBody(currentRows));
            currentRows = [];
            currentLen = wrapBody([]).length;
        }
        currentRows.push(row);
        currentLen += row.length + 1;
    }
    if (currentRows.length) messages.push(wrapBody(currentRows));

    if (!messages.length) messages.push(wrapBody(['(geen spelers in de snapshot)']));

    // Prepend title/subtitle to first, append footer to last.
    messages[0] = `${titleLine}\n${subtitleLine}\n\n${messages[0]}`;
    messages[messages.length - 1] = `${messages[messages.length - 1]}\n\n${footerLine}`;

    return messages;
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
