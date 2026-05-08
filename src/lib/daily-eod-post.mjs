import { EmbedBuilder } from 'discord.js';
import { buildEodEmbeds, fetchEodSnapshot, filterActiveSubs } from './eod-leaderboard.mjs';

const TWA_COLOR = 0x06b6d4;

// Post as soon after the CoC EOD reset (05:00 UTC) as is safe.
// Snapshot scheduler kicks off at 05:15 UTC and takes 30s-2min; 05:20 UTC
// gives it time to finish, then we post immediately.
const POST_HOUR_UTC = 5;
const POST_MINUTE_UTC = 20;

function msUntilNextPost(now = new Date()) {
    const next = new Date(now);
    next.setUTCHours(POST_HOUR_UTC, POST_MINUTE_UTC, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
}

export async function postDailyLeaderboard(client, { channelOverride = null, refresh = false } = {}) {
    const channelId = channelOverride || process.env.EOD_DAILY_CHANNEL_ID;
    const requiredRoleId = process.env.EOD_REQUIRED_ROLE_ID;
    if (!channelId) {
        return { ok: false, reason: 'EOD_DAILY_CHANNEL_ID not set' };
    }
    if (!requiredRoleId) {
        return { ok: false, reason: 'EOD_REQUIRED_ROLE_ID missing' };
    }

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
        data = await fetchEodSnapshot({ refresh });
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

    // Delete previous EOD posts from this bot so only today's leaderboard remains.
    let deleted = 0;
    try {
        const recent = await channel.messages.fetch({ limit: 50 });
        const mine = recent.filter((m) =>
            m.author?.id === client.user.id
            && m.embeds?.some((e) => /Legend League/i.test(e.title || ''))
        );
        for (const msg of mine.values()) {
            try {
                await msg.delete();
                deleted += 1;
            } catch { /* ignore */ }
        }
    } catch (err) {
        console.warn('[eod:daily] could not prune old posts:', err.message);
    }

    try {
        const parts = buildEodEmbeds(data, filtered);
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
