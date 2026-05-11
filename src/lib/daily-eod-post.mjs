import { EmbedBuilder } from 'discord.js';
import { buildEodEmbeds, fetchEodSnapshot, filterActiveSubs } from './eod-leaderboard.mjs';

const TWA_COLOR = 0x06b6d4;

// Refresh hourly at minute 20. The CoC EOD snapshot scheduler kicks off at
// 05:15 UTC and takes 30s-2min; aligning to :20 keeps the post-EOD refresh
// safely after the snapshot finishes. Pre-snapshot hours skip gracefully
// with reason "no snapshot available yet".
const POST_MINUTE_UTC = 20;

function msUntilNextPost(now = new Date()) {
    const next = new Date(now);
    next.setUTCMinutes(POST_MINUTE_UTC, 0, 0);
    if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
    return next - now;
}

// Identify our own previous posts by post type so the running (today)
// schedule only prunes its own messages, not the once-daily yesterday post.
const isYesterdayPost = (title) => /\bFinal\b/i.test(title || '');
const isTodayPost = (title) => /Legend League/i.test(title || '') && !isYesterdayPost(title);
const TODAY_TITLE_RE = { test: isTodayPost };
const YESTERDAY_TITLE_RE = { test: isYesterdayPost };

async function postLeaderboard(client, {
    channelOverride = null,
    refresh = false,
    date = null,
    title = 'TWA Legend League',
    pruneRegex = TODAY_TITLE_RE,
    logTag = 'eod:daily',
} = {}) {
    const channelId = channelOverride || process.env.EOD_DAILY_CHANNEL_ID;
    const requiredRoleId = process.env.EOD_REQUIRED_ROLE_ID;
    if (!channelId) return { ok: false, reason: 'EOD_DAILY_CHANNEL_ID not set' };
    if (!requiredRoleId) return { ok: false, reason: 'EOD_REQUIRED_ROLE_ID missing' };

    let channel;
    try {
        channel = await client.channels.fetch(channelId);
    } catch (err) {
        return { ok: false, reason: `failed to fetch channel: ${err.message}` };
    }
    if (!channel?.isTextBased?.()) {
        return { ok: false, reason: 'channel is not text-based' };
    }

    let data;
    try {
        data = await fetchEodSnapshot({ refresh, date });
    } catch (err) {
        return { ok: false, reason: `failed to fetch snapshot: ${err.message}` };
    }
    if (!data?.ok || !data.players?.length) {
        return { ok: false, reason: 'no snapshot available yet' };
    }

    let filtered;
    try {
        filtered = await filterActiveSubs(channel.guild, data.players, requiredRoleId);
    } catch (err) {
        return { ok: false, reason: `failed to fetch role members: ${err.message}` };
    }
    if (!filtered.length) {
        return { ok: false, reason: 'no active subs in snapshot' };
    }

    // Prune only OUR previous posts of THIS type (running vs final).
    let deleted = 0;
    try {
        const recent = await channel.messages.fetch({ limit: 50 });
        const mine = recent.filter((m) =>
            m.author?.id === client.user.id
            && m.embeds?.some((e) => pruneRegex.test(e.title || ''))
        );
        for (const msg of mine.values()) {
            try {
                await msg.delete();
                deleted += 1;
            } catch { /* ignore */ }
        }
    } catch (err) {
        console.warn(`[${logTag}] could not prune old posts:`, err.message);
    }

    try {
        const parts = buildEodEmbeds(data, filtered, { title });
        for (const part of parts) {
            const embed = new EmbedBuilder()
                .setColor(TWA_COLOR)
                .setDescription(part.description);
            if (part.title) embed.setTitle(part.title);
            await channel.send({ embeds: [embed] });
        }
        return { ok: true, snapshotDate: data.snapshotDate, count: filtered.length, channelId, deleted };
    } catch (err) {
        return { ok: false, reason: `failed to send: ${err.message}` };
    }
}

export async function postDailyLeaderboard(client, opts = {}) {
    return postLeaderboard(client, {
        ...opts,
        title: 'TWA Legend League',
        pruneRegex: TODAY_TITLE_RE,
        logTag: 'eod:daily',
    });
}

export async function postYesterdayLeaderboard(client, opts = {}) {
    // Resolve "yesterday" relative to the current legend day (legend day rolls
    // at 05:00 UTC). Subtract 5h then 1 calendar day.
    const now = new Date();
    const legendNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    legendNow.setUTCDate(legendNow.getUTCDate() - 1);
    const yesterdayDate = legendNow.toISOString().slice(0, 10);
    return postLeaderboard(client, {
        ...opts,
        date: opts.date || yesterdayDate,
        title: 'TWA Legend League · Final',
        pruneRegex: YESTERDAY_TITLE_RE,
        logTag: 'eod:yesterday',
    });
}

export function startDailyEodScheduler(client) {
    const schedule = () => {
        const delay = msUntilNextPost();
        const next = new Date(Date.now() + delay);
        console.log(`[eod:daily] next post scheduled at ${next.toISOString()}`);
        setTimeout(async () => {
            try {
                const result = await postDailyLeaderboard(client, { refresh: true });
                if (result.ok) {
                    console.log(`[eod:daily] posted leaderboard for ${result.snapshotDate} (${result.count} subs)`);
                } else {
                    console.log(`[eod:daily] skipped: ${result.reason}`);
                }
            } catch (err) {
                console.error('[eod:daily] unexpected error:', err);
            }
            schedule();
        }, delay);
    };
    schedule();
}

// Yesterday's final standings: post once per day at 05:30 UTC, 30 min after
// the legend-day reset and the snapshot scheduler. CoC API has stabilised by
// then and legend_daily for yesterday is fully populated.
const YESTERDAY_POST_HOUR_UTC = 5;
const YESTERDAY_POST_MINUTE_UTC = 30;

function msUntilNextYesterdayPost(now = new Date()) {
    const next = new Date(now);
    next.setUTCHours(YESTERDAY_POST_HOUR_UTC, YESTERDAY_POST_MINUTE_UTC, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
}

export function startYesterdayEodScheduler(client) {
    const schedule = () => {
        const delay = msUntilNextYesterdayPost();
        const next = new Date(Date.now() + delay);
        console.log(`[eod:yesterday] next post scheduled at ${next.toISOString()}`);
        setTimeout(async () => {
            try {
                const result = await postYesterdayLeaderboard(client, { refresh: true });
                if (result.ok) {
                    console.log(`[eod:yesterday] posted final for ${result.snapshotDate} (${result.count} subs)`);
                } else {
                    console.log(`[eod:yesterday] skipped: ${result.reason}`);
                }
            } catch (err) {
                console.error('[eod:yesterday] unexpected error:', err);
            }
            schedule();
        }, delay);
    };
    schedule();
}
