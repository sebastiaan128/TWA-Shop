import { describe, it, expect } from 'vitest';
import { buildShowcase } from './base-showcase.mjs';

const SAVED = { id: 'abc123', thLevel: 17, mode: 'HV', legendMonth: 'September 2026', imageHosted: true };

describe('buildShowcase', () => {
  it('decorates the title with both icons', () => {
    const out = buildShowcase({ title: 'TH17 Anti-Root', saved: SAVED, siteUrl: 'https://s' });
    // The literal character, not ':100:' -- Discord only expands a shortcode
    // for text a person types, so a bot sending the code shows the words.
    expect(out.title).toContain('\u{1F4AF}');
    // A custom emoji renders only with its id attached.
    expect(out.title).toContain('<:blue_sword_rank_icon:1378042079879364721>');
    expect(out.title).toContain('TH17 Anti-Root');
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

  it('labels a Builder Base', () => {
    const out = buildShowcase({ title: 'x', saved: { ...SAVED, mode: 'WB' }, siteUrl: 'https://s' });
    expect(out.townHall).toBe('TH17 (Builder Base)');
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
