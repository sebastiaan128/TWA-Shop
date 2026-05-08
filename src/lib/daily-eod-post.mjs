import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { fetchEodSnapshot, filterActiveSubs, seasonInfo } from './eod-leaderboard.mjs';
import { renderEodImage } from './eod-image.mjs';

const TWA_COLOR = 0x06b6d4;

// Post hour/minute in UTC. 06:30 UTC = 07:30 CET / 08:30 CEST.
const POST_HOUR_UTC = 6;
const POST_MINUTE_UTC = 30;

function msUntilNextPost(now = new Date()) {
    const next = new Date(now);
    next.setUTCHours(POST_HOUR_UTC, POST_MINUTE_UTC, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
}

export async function postDailyLeaderboard(client, { channelOverride = null } = {}) {
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
        data = await fetchEodSnapshot();
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

    // Delete previous EOD posts from this bot so only today's leaderboard
    // remains in the channel.
    let deleted = 0;
    try {
        const recent = await channel.messages.fetch({ limit: 50 });
        const mine = recent.filter((m) =>
            m.author?.id === client.user.id
            && m.embeds?.some((e) => (e.title || e.author?.name || '').match(/End of Day|Legend League/i))
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
        const { seasonId, dayInSeason, seasonLength } = seasonInfo(data.snapshotDate);
        const png = renderEodImage({
            players: filtered,
            title: 'TWA Legend League',
            clanTag: '',
            dayInSeason,
            seasonLength,
            seasonId,
        });
        const attachment = new AttachmentBuilder(png, { name: 'eod.png' });
        const embed = new EmbedBuilder()
            .setColor(TWA_COLOR)
            .setImage('attachment://eod.png');
        await channel.send({ embeds: [embed], files: [attachment] });
        return { ok: true, snapshotDate: data.snapshotDate, count: filtered.length, channelId, deleted };
    } catch (err) {
        return { ok: false, reason: `failed to render/send: ${err.message}` };
    }
}

export function startDailyEodScheduler(client) {
    const schedule = () => {
        const delay = msUntilNextPost();
        const next = new Date(Date.now() + delay);
        console.log(`[eod:daily] next post scheduled at ${next.toISOString()}`);
        setTimeout(async () => {
            try {
                const result = await postDailyLeaderboard(client);
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
