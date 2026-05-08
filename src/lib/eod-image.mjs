import { createCanvas } from '@napi-rs/canvas';

const COLORS = {
    cardBg: '#1a1f2e',
    topRowBg: '#1e2540',
    rowBorder: '#22273a',
    headerBorder: '#2a2f42',
    hexFill: '#2a3a5c',
    hexStroke: '#4fc3f7',
    clanName: '#4fc3f7',
    clanTag: '#5a6075',
    subtitle: '#8a90a8',
    colHeader: '#5a6075',
    gain: '#aeea00',
    loss: '#ef5350',
    final: '#ffffff',
    nameTop: '#ffffff',
    nameRest: '#c8cde0',
    star: '#ffd700',
    footer: '#5a6075',
    dash: '#5a6075',
};

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function sup(n) {
    return String(n ?? 0).split('').map((c) => SUP[+c] ?? c).join('');
}

const W = 600;
const PAD_X = 16;
const HEAD_H = 64;
const COL_HEAD_H = 30;
const ROW_H = 30;
const FOOTER_H = 36;
const COL = {
    gain: { right: PAD_X + 88,  left: PAD_X + 16  },
    loss: { right: PAD_X + 168, left: PAD_X + 96  },
    final:{ right: PAD_X + 240, left: PAD_X + 180 },
    name: { left: PAD_X + 252 },
};

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawHexagon(ctx, cx, cy, size, fill, stroke, strokeW = 2) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = cx + size * Math.cos(a);
        const y = cy + size * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeW;
    ctx.stroke();
}

function trackedText(ctx, text, x, y, letterSpacing = 0) {
    if (!letterSpacing) {
        ctx.fillText(text, x, y);
        return;
    }
    let cx = x;
    for (const ch of text) {
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + letterSpacing;
    }
}

function trackedWidth(ctx, text, letterSpacing = 0) {
    if (!letterSpacing) return ctx.measureText(text).width;
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + letterSpacing;
    return w - letterSpacing;
}

function fmtGain(p) {
    const atks = p.dailyAttacks ?? 0;
    const hasReal = typeof p.dailyGain === 'number';
    if (hasReal) {
        const g = p.dailyGain ?? 0;
        if (g > 0) return `+${g}${sup(atks)}`;
        return null;
    }
    const d = p.todayDelta;
    if (typeof d === 'number' && d > 0) return `+${d}${sup(atks)}`;
    return null;
}

const AVG = 32;
function fmtLoss(p) {
    const atks = p.dailyAttacks ?? 0;
    const lostDefs = typeof p.lostDefenseCount === 'number'
        ? p.lostDefenseCount
        : Math.max(0, Math.round((atks * AVG - (p.todayDelta ?? 0)) / AVG));
    const hasReal = typeof p.dailyLoss === 'number';
    if (hasReal) {
        const l = p.dailyLoss ?? 0;
        if (l > 0) return `-${l}${sup(lostDefs)}`;
        return null;
    }
    const d = p.todayDelta;
    if (typeof d === 'number' && d < 0) return `${d}${sup(lostDefs)}`;
    return null;
}

export function renderEodImage({
    players,
    title = 'TWA',
    clanTag = '#TWA',
    dayInSeason,
    seasonLength,
    seasonId,
}) {
    const sorted = [...players].sort((a, b) => (b.trophies ?? 0) - (a.trophies ?? 0));

    const H = HEAD_H + COL_HEAD_H + sorted.length * ROW_H + FOOTER_H;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Card background (rounded)
    ctx.fillStyle = COLORS.cardBg;
    roundRect(ctx, 0, 0, W, H, 12);
    ctx.fill();

    // ── HEADER ──
    drawHexagon(ctx, PAD_X + 14, HEAD_H / 2, 12, COLORS.hexFill, COLORS.hexStroke, 2);

    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = COLORS.clanName;
    const titleX = PAD_X + 38;
    const titleY = HEAD_H / 2 - 9;
    ctx.fillText(title, titleX, titleY);
    const titleW = ctx.measureText(title).width;

    ctx.font = '12px monospace';
    ctx.fillStyle = COLORS.clanTag;
    ctx.fillText(clanTag, titleX + titleW + 6, titleY);

    ctx.font = '11px monospace';
    ctx.fillStyle = COLORS.subtitle;
    const subText = `LEGEND LEAGUE ATTACKS · END OF DAY ${dayInSeason}/${seasonLength} · ${seasonId}`;
    trackedText(ctx, subText, titleX, HEAD_H / 2 + 11, 0.6);

    // Header bottom border
    ctx.fillStyle = COLORS.headerBorder;
    ctx.fillRect(PAD_X, HEAD_H, W - 2 * PAD_X, 1);

    // ── COLUMN HEADERS ──
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = COLORS.colHeader;
    ctx.textBaseline = 'middle';
    const yColH = HEAD_H + COL_HEAD_H / 2;
    const ls = 0.8;

    ctx.textAlign = 'right';
    trackedText(ctx, 'GAIN', COL.gain.right - trackedWidth(ctx, 'GAIN', ls) + trackedWidth(ctx, 'GAIN', ls), yColH, ls);
    trackedText(ctx, 'LOSS', COL.loss.right - trackedWidth(ctx, 'LOSS', ls) + trackedWidth(ctx, 'LOSS', ls), yColH, ls);
    trackedText(ctx, 'FINAL', COL.final.right - trackedWidth(ctx, 'FINAL', ls) + trackedWidth(ctx, 'FINAL', ls), yColH, ls);
    ctx.textAlign = 'left';
    trackedText(ctx, 'NAME', COL.name.left, yColH, ls);

    // ── ROWS ──
    let y = HEAD_H + COL_HEAD_H;
    for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];
        const isTop3 = i < 3;
        const rank = i + 1;

        // Top-3 row background
        if (isTop3) {
            ctx.fillStyle = COLORS.topRowBg;
            ctx.fillRect(PAD_X, y, W - 2 * PAD_X, ROW_H);
        }

        // Row top border
        ctx.fillStyle = COLORS.rowBorder;
        ctx.fillRect(PAD_X, y, W - 2 * PAD_X, 1);

        const yMid = y + ROW_H / 2;

        // GAIN (right-aligned)
        const gainText = fmtGain(p);
        ctx.font = '13px monospace';
        ctx.textAlign = 'right';
        if (gainText) {
            ctx.fillStyle = COLORS.gain;
            ctx.fillText(gainText, COL.gain.right, yMid);
        } else {
            ctx.fillStyle = COLORS.dash;
            ctx.fillText('—', COL.gain.right, yMid);
        }

        // LOSS (right-aligned)
        const lossText = fmtLoss(p);
        if (lossText) {
            ctx.fillStyle = COLORS.loss;
            ctx.fillText(lossText, COL.loss.right, yMid);
        } else {
            ctx.fillStyle = COLORS.dash;
            ctx.fillText('—', COL.loss.right, yMid);
        }

        // FINAL (right-aligned, bold)
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = COLORS.final;
        ctx.fillText(String(p.trophies ?? 0), COL.final.right, yMid);

        // NAME (left-aligned)
        ctx.textAlign = 'left';
        ctx.font = isTop3 ? 'bold 13px monospace' : '13px monospace';
        ctx.fillStyle = isTop3 ? COLORS.nameTop : COLORS.nameRest;
        const nameText = (p.name || p.tag).slice(0, 24);
        ctx.fillText(nameText, COL.name.left, yMid);

        // Star for rank 1
        if (rank === 1) {
            const nameW = ctx.measureText(nameText).width;
            ctx.fillStyle = COLORS.star;
            ctx.fillText(' ★', COL.name.left + nameW, yMid);
        }

        y += ROW_H;
    }

    // ── FOOTER ──
    ctx.fillStyle = COLORS.headerBorder;
    ctx.fillRect(PAD_X, y, W - 2 * PAD_X, 1);

    ctx.font = '11px monospace';
    ctx.fillStyle = COLORS.footer;
    ctx.textAlign = 'left';
    ctx.fillText(
        `End of Day ${dayInSeason}/${seasonLength} (${seasonId})`,
        PAD_X + 16,
        y + FOOTER_H / 2,
    );

    return canvas.toBuffer('image/png');
}
