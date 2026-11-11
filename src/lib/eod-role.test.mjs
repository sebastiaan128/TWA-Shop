import { describe, it, expect } from 'vitest';
import { resolveEodRoleId, filterActiveSubs } from './eod-leaderboard.mjs';

function guild(names) {
    return {
        channels: { fetch: async () => ({ permissionOverwrites: { cache: new Map(names.map(([id]) => [id, {
            id, type: 0, allow: { has: () => true }, deny: { has: () => false },
        }])) } }) },
        roles: { fetch: async () => new Map(names.map(([id, name]) => [id, { name }])) },
    };
}

describe('EOD monthly role', () => {
    it('uses the channel month role instead of the legacy subscriber role', async () => {
        process.env.EOD_DAILY_CHANNEL_ID = 'channel';
        const g = guild([['old', 'LL Subscriber'], ['new', 'LL November 2026']]);
        const role = await resolveEodRoleId(g);
        expect(role).toBe('new');
        g.members = { fetch: async () => new Map([
            ['one', { id: 'one', roles: { cache: new Map([['new', {}]]) } }],
            ['two', { id: 'two', roles: { cache: new Map([['old', {}]]) } }],
        ]) };
        expect(await filterActiveSubs(g, [{ discordUserId: 'one' }, { discordUserId: 'two' }], role))
            .toEqual([{ discordUserId: 'one', rank: 1 }]);
    });
    it('follows the next rollover without configuration changes', async () => {
        process.env.EOD_DAILY_CHANNEL_ID = 'channel';
        expect(await resolveEodRoleId(guild([['next', 'LL December']]))).toBe('next');
    });
    it('rejects missing or ambiguous month roles', async () => {
        process.env.EOD_DAILY_CHANNEL_ID = 'channel';
        await expect(resolveEodRoleId(guild([['old', 'LL Subscriber']]))).rejects.toThrow('found 0');
        await expect(resolveEodRoleId(guild([['a', 'LL November'], ['b', 'LL December']]))).rejects.toThrow('found 2');
    });
});
