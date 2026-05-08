import { EmbedBuilder } from 'discord.js';

const TWA_COLOR = 0x1a1f2e;
const TWA_AUTHOR_ICON = 'https://twabases.com/assets/Logo.png';
const ESC = '\x1b';
const C = {
    reset: `${ESC}[0m`,
    muted: `${ESC}[2;37m`,
    white: `${ESC}[1;37m`,
    green: `${ESC}[2;32m`,
    red: `${ESC}[2;31m`,
};

const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const toSuper = (n) => (n == null ? '' : String(n).split('').map((c) => SUP[c] ?? c).join(''));

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

// Strip emoji/symbols that would break monospace alignment.
function stripWideChars(s) {
    return s.replace(/[\p{Extended_Pictographic}‍️​]/gu, '').trim();
}

function visualLength(s) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padEndVisual(s, n) {
    const len = visualLength(s);
    return s + ' '.repeat(Math.max(0, n - len));
}

function padStartVisual(s, n) {
    const len = visualLength(s);
    return ' '.repeat(Math.max(0, n - len)) + s;
}

export function buildEodLines(filtered) {
    const cleanNames = filtered.map((p) => stripWideChars(p.name || p.tag).slice(0, 16) || p.tag);
    const nameWidth = Math.max(4, ...cleanNames.map((n) => n.length));

    return filtered.map((p, i) => {
        const atks = p.dailyAttacks ?? 0;
        const defs = p.dailyDefenses ?? 0;
        const hasReal = typeof p.dailyGain === 'number' || typeof p.dailyLoss === 'number';

        let gainCell;
        let lossCell;
        if (hasReal) {
            const gain = p.dailyGain ?? 0;
            const loss = p.dailyLoss ?? 0;
            gainCell = gain > 0 || atks > 0
                ? `${C.green}+${gain}${toSuper(atks)}${C.reset}`
                : '';
            lossCell = loss > 0 || defs > 0
                ? `${C.red}-${loss}${toSuper(defs)}${C.reset}`
                : '';
        } else {
            // Fallback: only net delta available
            const delta = p.todayDelta;
            if (delta == null) {
                gainCell = `${C.muted}—${C.reset}`;
                lossCell = `${C.muted}—${C.reset}`;
            } else if (delta > 0) {
                gainCell = `${C.green}+${delta}${toSuper(atks)}${C.reset}`;
                lossCell = defs > 0 ? `${C.muted}${toSuper(defs)}${C.reset}` : '';
            } else if (delta < 0) {
                gainCell = atks > 0 ? `${C.muted}${toSuper(atks)}${C.reset}` : '';
                lossCell = `${C.red}${delta}${toSuper(defs)}${C.reset}`;
            } else {
                gainCell = `${C.muted}0${toSuper(atks)}${C.reset}`;
                lossCell = `${C.muted}${toSuper(defs)}${C.reset}`;
            }
        }

        const final = `${C.white}${p.trophies ?? 0}${C.reset}`;
        const name = `${C.white}${cleanNames[i]}${C.reset}`;

        return (
            padStartVisual(gainCell, 7) +
            '  ' +
            padStartVisual(lossCell, 7) +
            '   ' +
            padEndVisual(final, 5) +
            '  ' +
            padEndVisual(name, nameWidth)
        );
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
    if (current.length > header.length) chunks.push(current);
    return chunks;
}

function buildHeader(filtered) {
    const cleanNames = filtered.map((p) => stripWideChars(p.name || p.tag).slice(0, 16) || p.tag);
    const nameWidth = Math.max(4, ...cleanNames.map((n) => n.length));
    const labels =
        padStartVisual('GAIN', 7) +
        '  ' +
        padStartVisual('LOSS', 7) +
        '   ' +
        padEndVisual('FINAL', 5) +
        '  ' +
        padEndVisual('NAME', nameWidth);
    return '```ansi\n' + `${C.muted}${labels}${C.reset}\n`;
}

export function buildEodEmbeds(data, filtered, { title } = {}) {
    const lines = buildEodLines(filtered);
    const header = buildHeader(filtered);
    const dateStr = data.snapshotDate || '—';
    const day = dateStr.slice(8, 10);
    const month = dateStr.slice(0, 7);

    const chunks = chunkLines(lines, header).map((c) => c + '```');

    const head = new EmbedBuilder()
        .setAuthor({ name: 'TWA  ·  Legend League Attacks', iconURL: TWA_AUTHOR_ICON })
        .setTitle(title || `End of Day · ${dateStr}`)
        .setDescription(chunks[0] || '_Geen spelers in de snapshot._')
        .setColor(TWA_COLOR)
        .setFooter({ text: `End of Day ${day} (${month})` });

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
