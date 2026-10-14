import { describe, it, expect } from 'vitest';
import { buildShowcase, SHOWCASE_REACTIONS, ccLine, ccFromPost, showcaseEmbed } from './base-showcase.mjs';

const SAVED = { id: 'abc123', thLevel: 17, mode: 'HV', legendMonth: 'September 2026', imageHosted: true };

describe('buildShowcase', () => {
  it('leaves the title alone -- the icons are reactions, not decoration', () => {
    const out = buildShowcase({ title: 'TH17 Anti-Root', saved: SAVED, siteUrl: 'https://s' });
    expect(out.title).toBe('TH17 Anti-Root');
  });

  it('never carries the layout link', () => {
    // The whole delivery design rests on the raw link existing only behind a
    // per-person /r/<token>. A channel is read by every subscriber, so one
    // link posted here is one link they all share -- and the download log
    // this feature exists to produce becomes worthless.
    const out = buildShowcase({
      title: 'TH17 Legend #4',
      layoutLink: 'https://link.clashofclans.com/?action=OpenLayout&id=TH17%3AHV%3ASECRET',
      saved: SAVED, screenshotUrl: 'https://cdn/x.png', siteUrl: 'https://twabases.com',
    });
    expect(JSON.stringify(out)).not.toContain('SECRET');
    expect(JSON.stringify(out)).not.toContain('link.clashofclans.com');
  });

  it('points at the base, which resolves the viewer\'s own token', () => {
    const out = buildShowcase({ title: 'x', saved: SAVED, siteUrl: 'https://twabases.com' });
    expect(out.openUrl).toBe('https://twabases.com/base/abc123');
  });

  it('tolerates a site url with a trailing slash', () => {
    const out = buildShowcase({ title: 'x', saved: SAVED, siteUrl: 'https://twabases.com/' });
    expect(out.openUrl).toBe('https://twabases.com/base/abc123');
  });

  it('refuses without a base id rather than posting a button that 404s', () => {
    expect(() => buildShowcase({ title: 'x', saved: { ...SAVED, id: null }, siteUrl: 'https://s' }))
      .toThrow(/base id/i);
  });

  it('names the season for a legend base', () => {
    const out = buildShowcase({ title: 'x', saved: SAVED, siteUrl: 'https://s' });
    expect(out.season).toBe('September 2026');
  });

  it('omits the season for a base that has none', () => {
    const out = buildShowcase({ title: 'x', saved: { ...SAVED, legendMonth: null }, siteUrl: 'https://s' });
    expect(out.season).toBe(null);
  });

  it('labels a war layout as a war base, not a builder base', () => {
    // WB is the WAR layout. A builder base has a Builder Hall rather than a
    // Town Hall, so it cannot appear behind the TH prefix these ids require --
    // the old "Builder Base" label was unreachable as well as wrong.
    const out = buildShowcase({ title: 'x', saved: { ...SAVED, mode: 'WB' }, siteUrl: 'https://s' });
    expect(out.townHall).toBe('TH17 (War base)');
  });

  it('leaves a home village layout unannotated', () => {
    const out = buildShowcase({ title: 'x', saved: { ...SAVED, mode: 'HV' }, siteUrl: 'https://s' });
    expect(out.townHall).toBe('TH17');
  });

  it('uses the screenshot as the image when one was hosted', () => {
    const out = buildShowcase({ title: 'x', saved: SAVED, screenshotUrl: 'https://cdn/x.png', siteUrl: 'https://s' });
    expect(out.imageUrl).toBe('https://cdn/x.png');
  });

  it('has no image when the screenshot failed to host', () => {
    // Posting the Discord attachment URL instead would look fine today and be
    // a dead image tomorrow: those links are signed and expire in about a day.
    const out = buildShowcase({
      title: 'x', saved: { ...SAVED, imageHosted: false },
      screenshotUrl: 'https://cdn.discordapp.com/tmp.png', siteUrl: 'https://s',
    });
    expect(out.imageUrl).toBe(null);
  });

  it('refuses to build without a site url rather than posting a broken button', () => {
    expect(() => buildShowcase({ title: 'x', saved: SAVED, siteUrl: '' })).toThrow(/site url/i);
  });
});

describe('SHOWCASE_REACTIONS', () => {
  it('sends the literal character, not the :100: shortcode', () => {
    // A bot posting ':100:' posts the words; only a person's typing expands.
    expect(SHOWCASE_REACTIONS).toContain('\u{1F4AF}');
    expect(SHOWCASE_REACTIONS.some((e) => e.includes(':100:'))).toBe(false);
  });

  it('carries the custom emoji id, since the name alone resolves to nothing', () => {
    expect(SHOWCASE_REACTIONS).toContain('blue_sword_rank_icon:1378042079879364721');
  });
});

describe('buildShowcase: Clan Castle', () => {
  const site = 'https://twabases.com';
  it('puts each kind of the site text on its own line', () => {
    const out = buildShowcase({ title: 'T', saved: { id: 'b1', thLevel: 17, cc: 'Troops: 2× Super Minion · Spells: 1× Poison' }, siteUrl: site });
    expect(out.clanCastle).toBe('Troops: 2× Super Minion\nSpells: 1× Poison');
  });
  it('is null when no CC was set', () => {
    expect(buildShowcase({ title: 'T', saved: { id: 'b1', thLevel: 17, cc: '' }, siteUrl: site }).clanCastle).toBe(null);
  });
});

describe('showcaseEmbed: CC line under the title', () => {
  const site = 'https://twabases.com';
  it('shows the CC as one line, without the kind labels', () => {
    const show = buildShowcase({ title: 'Drums 2.1', saved: { id: 'b1', thLevel: 18, legendMonth: 'October 2026', cc: 'Troops: 2× Ice Golem, 1× Furnace · Spells: 1× Poison' }, siteUrl: site });
    const e = showcaseEmbed(show);
    expect(e.description).toBe('**CC:** 2× Ice Golem, 1× Furnace · 1× Poison');
    expect(e.fields.map((f) => f.name)).toEqual(['Town Hall', 'Season']);
  });
  it('says when there is no CC', () => {
    const show = buildShowcase({ title: 'T', saved: { id: 'b1', thLevel: 18, cc: '' }, siteUrl: site });
    expect(showcaseEmbed(show).description).toBe('**CC:** _not set yet_');
    expect(ccLine('')).toBe(null);
  });
  it('reads the CC back from a post, new or old', () => {
    expect(ccFromPost({ description: '**CC:** 2× Ice Golem · 1× Poison' })).toBe('2× Ice Golem · 1× Poison');
    expect(ccFromPost({ description: '**CC:** _not set yet_' })).toBe('');
    expect(ccFromPost({ fields: [{ name: 'Clan Castle', value: 'Troops: 1× Witch' }] })).toBe('Troops: 1× Witch');
  });
});
