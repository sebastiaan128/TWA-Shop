import { describe, it, expect } from 'vitest';
import { buildEodEmbeds } from './eod-leaderboard.mjs';

const players = [{ tag: '#ABC', name: 'Player One', trophies: 5200 }];

describe('buildEodEmbeds — season label', () => {
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
