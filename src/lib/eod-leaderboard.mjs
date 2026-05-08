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
    let atks;
    if (typeof p.attackCount === 'number') {
        atks = p.attackCount;
    } else if (typeof p.todayDelta === 'number' && p.todayDelta > 0) {
        // Fallback: estimate count of attacks purely from the net gain,
        // mirroring how LOSS count is estimated.
        atks = Math.max(1, Math.round(p.todayDelta / AVG_PER_ACTION));
    } else {
        atks = p.dailyAttacks ?? 0;
    }
    if (typeof p.dailyGain === 'number') {
        return p.dailyGain > 0 ? `+${p.dailyGain}${sup(atks)}` : '—';
    }
    const d = p.todayDelta;
    return typeof d === 'number' && d > 0 ? `+${d}${sup(atks)}` : '—';
}

function fmtLoss(p) {
    let lostDefs;
    if (typeof p.lostDefenseCount === 'number') {
        lostDefs = p.lostDefenseCount;
    } else if (typeof p.todayDelta === 'number' && p.todayDelta < 0) {
        // Fallback: estimate count of lost defenses purely from the net loss.
        lostDefs = Math.max(1, Math.round(-p.todayDelta / AVG_PER_ACTION));
    } else {
        lostDefs = 0;
    }
    if (typeof p.dailyLoss === 'number') {
        return p.dailyLoss > 0 ? `-${p.dailyLoss}${sup(lostDefs)}` : '—';
    }
    const d = p.todayDelta;
    return typeof d === 'number' && d < 0 ? `${d}${sup(lostDefs)}` : '—';
}

const COL_GAIN = 6;
const COL_LOSS = 6;
const COL_FINAL = 5;
const NAME_MAX = 13;

// Discord monospace renders superscript digits at the same advance width as
// normal digits, so plain padEnd is enough — no compensation needed.
function padCell(value, width) {
    return value.padEnd(width);
}

export function buildEodEmbeds(data, filtered, { title = 'TWA Legend League', clanTag = '' } = {}) {
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
        const rawName = stripWideChars(p.name || p.tag) || p.tag;
        const name = rawName.length > NAME_MAX ? rawName.slice(0, NAME_MAX - 1) + '…' : rawName;
        const star = i === 0 ? ' ★' : '';
        return (
            padCell(gain, COL_GAIN) +
            padCell(loss, COL_LOSS) +
            final.padEnd(COL_FINAL) +
            name + star
        ).trimEnd();
    });

    const headerInline = `\`${headerLine}\``;
    const rowInlines = rows.map((r) => `\`${r}\``);

    // Pack rows into one or more embed descriptions (4096 char limit each).
    const descriptions = [];
    let buf = headerInline;
    for (const row of rowInlines) {
        const projected = buf.length + row.length + 1;
        if (projected > 3900) {
            descriptions.push(buf);
            buf = headerInline;
        }
        buf += '\n' + row;
    }
    if (buf) descriptions.push(buf);
    if (!descriptions.length) descriptions.push(`${headerInline}\n_(geen spelers in de snapshot)_`);

    const fullTitle = `🏆 ${title}${clanTag ? ` (${clanTag})` : ''}`;

    return descriptions.map((desc, i) => ({
        title: i === 0 ? fullTitle : null,
        description: desc,
        seasonId,
        dayInSeason,
        seasonLength,
        isFirst: i === 0,
        isLast: i === descriptions.length - 1,
    }));
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

export async function fetchEodSnapshot({ refresh = false } = {}) {
    const url = process.env.EOD_API_URL;
    const key = process.env.EOD_API_KEY;
    if (!url || !key) throw new Error('EOD_API_URL or EOD_API_KEY missing');
    const u = refresh ? `${url}${url.includes('?') ? '&' : '?'}refresh=1` : url;
    const resp = await fetch(u, { headers: { 'x-api-key': key } });
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
