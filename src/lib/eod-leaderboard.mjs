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

const AVG_GAIN_PER_ATTACK = 32;     // typical 2★ legend attack
const AUTO_LOSS_PER_DEFENSE = 30;   // standard legend "auto-defense" value
// Legend league hard caps: 8 attacks/day, 8 defenses/day, so any estimated
// count must be clamped to 8 regardless of the gross we're back-solving from.
const LEGEND_MAX_ATTACKS = 8;
const LEGEND_MAX_DEFENSES = 8;

// Estimate an action count from a gross gain/loss when the upstream count is
// missing. Always derive from the number we're about to display (gross), never
// from the net trophy delta — net can be tiny or wrong-signed for one side
// even when that side did a lot of actions (e.g. gain 392 / loss 381 → net 11).
function estimateAttackCount(grossGain) {
    return Math.min(LEGEND_MAX_ATTACKS, Math.max(1, Math.round(grossGain / AVG_GAIN_PER_ATTACK)));
}
function estimateDefenseCount(grossLoss) {
    return Math.min(LEGEND_MAX_DEFENSES, Math.max(1, Math.round(grossLoss / AUTO_LOSS_PER_DEFENSE)));
}

// Reconstructions get `~` instead of `+`/`-`. Measured polling data keeps the
// normal `+`/`-` so the user can see at a glance which rows are trustworthy.
function fmtGain(p) {
    const sign = p.gainEstimated ? '~' : '+';
    if (typeof p.dailyGain === 'number') {
        if (p.dailyGain <= 0) return '—';
        const atks = typeof p.attackCount === 'number'
            ? Math.min(LEGEND_MAX_ATTACKS, p.attackCount)
            : estimateAttackCount(p.dailyGain);
        return `${sign}${p.dailyGain}${sup(atks)}`;
    }
    const d = p.todayDelta;
    if (typeof d !== 'number' || d <= 0) return '—';
    const atks = typeof p.attackCount === 'number'
        ? Math.min(LEGEND_MAX_ATTACKS, p.attackCount)
        : estimateAttackCount(d);
    return `${sign}${d}${sup(atks)}`;
}

function fmtLoss(p) {
    const sign = p.lossEstimated ? '~' : '-';
    if (typeof p.dailyLoss === 'number') {
        if (p.dailyLoss <= 0) return '—';
        const lostDefs = typeof p.lostDefenseCount === 'number'
            ? Math.min(LEGEND_MAX_DEFENSES, p.lostDefenseCount)
            : estimateDefenseCount(p.dailyLoss);
        return `${sign}${p.dailyLoss}${sup(lostDefs)}`;
    }
    const d = p.todayDelta;
    if (typeof d !== 'number' || d >= 0) return '—';
    const lostDefs = typeof p.lostDefenseCount === 'number'
        ? Math.min(LEGEND_MAX_DEFENSES, p.lostDefenseCount)
        : estimateDefenseCount(-d);
    // For non-estimated true negative deltas, keep the original `-NNN` form.
    return p.lossEstimated ? `~${Math.abs(d)}${sup(lostDefs)}` : `${d}${sup(lostDefs)}`;
}

const COL_GAIN = 6;
const COL_LOSS = 6;
const COL_FINAL = 5;
const NAME_MAX = 16;

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
        'FINAL'.padEnd(COL_FINAL) + '  ' +
        'NAME';

    const rows = sorted.map((p, i) => {
        const gain = fmtGain(p);
        const loss = fmtLoss(p);
        const final = String(p.trophies ?? 0);
        const rawName = stripWideChars(p.name || p.tag) || p.tag;
        const truncated = rawName.length > NAME_MAX ? rawName.slice(0, NAME_MAX - 1) + '…' : rawName;
        // NBSP inside the name so Discord can't wrap "[TW Mootje]" onto two
        // lines on narrow embed widths (mobile, threads, narrow windows).
        const name = truncated.replace(/ /g, ' ');
        const star = i === 0 ? ' ★' : '';
        return (
            padCell(gain, COL_GAIN) +
            padCell(loss, COL_LOSS) +
            final.padEnd(COL_FINAL) + '  ' +
            name + star
        ).trimEnd();
    });

    // One unified triple-backtick block per embed description.
    const wrapBody = (bodyRows) =>
        '```\n' + headerLine + '\n' + bodyRows.join('\n') + '\n```';

    const descriptions = [];
    let currentRows = [];
    let currentLen = wrapBody([]).length;
    for (const row of rows) {
        if (currentLen + row.length + 1 > 3900 && currentRows.length) {
            descriptions.push(wrapBody(currentRows));
            currentRows = [];
            currentLen = wrapBody([]).length;
        }
        currentRows.push(row);
        currentLen += row.length + 1;
    }
    if (currentRows.length) descriptions.push(wrapBody(currentRows));
    if (!descriptions.length) descriptions.push(wrapBody(['(geen spelers in de snapshot)']));

    const fullTitle = `🏆 ${title}${clanTag ? ` (${clanTag})` : ''} · End of Day ${dayInSeason}/${seasonLength}`;

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

export async function fetchEodSnapshot({ refresh = false, date = null } = {}) {
    const url = process.env.EOD_API_URL;
    const key = process.env.EOD_API_KEY;
    if (!url || !key) throw new Error('EOD_API_URL or EOD_API_KEY missing');
    const params = [];
    if (refresh) params.push('refresh=1');
    if (date) params.push(`date=${encodeURIComponent(date)}`);
    const u = params.length
        ? `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`
        : url;
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
