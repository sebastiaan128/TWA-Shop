import { describe, it, expect } from 'vitest';
import { buildEodEmbeds } from './eod-leaderboard.mjs';

const players = [{ tag: '#ABC', name: 'Player One', trophies: 5200 }];

describe('buildEodEmbeds, season label', () => {
  it('uses the server-provided dayInSeason/seasonLength in the title', () => {
    const data = {
      snapshotDate: '2026-06-15',
      seasonId: '2026-06',
      dayInSeason: 1,
      seasonLength: 28,
    };
    const [first] = buildEodEmbeds(data, players);
    expect(first.title).toContain('End of Day 1/28');
    expect(first.dayInSeason).toBe(1);
    expect(first.seasonLength).toBe(28);
  });

  it('falls back to the local heuristic when the API omits season info', () => {
    // No seasonId/dayInSeason/seasonLength on data → local seasonInfo() runs.
    const [first] = buildEodEmbeds({ snapshotDate: '2026-06-15' }, players);
    expect(first.title).toMatch(/End of Day \d+\/\d+/);
  });
});

describe('buildEodEmbeds, physical floor on action counts', () => {
  const data = {
    snapshotDate: '2026-06-17',
    seasonId: '2026-06',
    dayInSeason: 1,
    seasonLength: 28,
  };

  it('floors an impossible attack count up to ceil(gain/40)', () => {
    // 169 trophies cannot come from 1 attack (max 40/attack → ≥5 attacks).
    // The server may send attackCount:1 (legacy attackWins-delta bug); the
    // renderer must never display a physically impossible ratio.
    const [embed] = buildEodEmbeds(data, [{
      tag: '#X', name: 'TheDictator', trophies: 5184,
      dailyGain: 169, dailyLoss: 0,
      attackCount: 1, lostDefenseCount: 0,
      gainEstimated: true,
    }]);
    expect(embed.description).toContain('~169⁵'); // ~169⁵
    expect(embed.description).not.toContain('~169¹'); // never ~169¹
  });

  it('floors an impossible defense count up to ceil(loss/40)', () => {
    // 71 trophies lost cannot come from 1 defense (max 40/defense → ≥2).
    const [embed] = buildEodEmbeds(data, [{
      tag: '#Y', name: 'Dp_Jesse', trophies: 5007,
      dailyGain: 0, dailyLoss: 71,
      attackCount: 0, lostDefenseCount: 1,
      lossEstimated: true,
    }]);
    expect(embed.description).toContain('~71²'); // ~71²
    expect(embed.description).not.toContain('~71¹'); // never ~71¹
  });
});
