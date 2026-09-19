import { describe, it, expect } from 'vitest';
import { openButtonRow, isOpenBaseId, baseIdFromOpen, hasVaticRole } from './base-open-button.mjs';

describe('hasVaticRole', () => {
  const VATIC = '1453062350809862154';

  it('admits a member holding the role', () => {
    expect(hasVaticRole(['123', VATIC], VATIC)).toBe(true);
  });

  it('turns away a member without it', () => {
    expect(hasVaticRole(['123', '456'], VATIC)).toBe(false);
  });

  it('fails closed when the role is not configured', () => {
    // An unset env var must send everyone down the site path, not hand the
    // raw layout link to the whole channel.
    expect(hasVaticRole(['123', VATIC], '')).toBe(false);
    expect(hasVaticRole(['123', VATIC], undefined)).toBe(false);
  });

  it('fails closed when the member has no roles to read', () => {
    expect(hasVaticRole(null, VATIC)).toBe(false);
  });

  it('is an exact match, not a positional one', () => {
    // Unlike staff-gate: Vatic is not a rank with more senior roles above it,
    // so "any role above this one" would quietly widen who gets raw links.
    expect(hasVaticRole(['1453062350809862155'], VATIC)).toBe(false);
  });
});

describe('openButtonRow', () => {
  it('carries the base id in the custom id, since a click is a fresh interaction', () => {
    const row = openButtonRow('abc123');
    const button = row.components[0].data;
    expect(button.custom_id).toBe('openbase:abc123');
    expect(button.label).toBe('Download base');
  });

  it('is a bot button, not a link button -- the bot must see the click', () => {
    expect(openButtonRow('abc123').components[0].data.url).toBeUndefined();
  });

  it('refuses without a base id rather than posting a button that answers nothing', () => {
    expect(() => openButtonRow('')).toThrow(/base id/i);
  });

  it('recognises its own clicks and nobody else\'s', () => {
    expect(isOpenBaseId('openbase:abc123')).toBe(true);
    expect(isOpenBaseId('editbase:abc123')).toBe(false);
    expect(isOpenBaseId('close_ticket')).toBe(false);
    expect(isOpenBaseId(undefined)).toBe(false);
  });

  it('reads the base id back out of a click', () => {
    expect(baseIdFromOpen('openbase:abc123')).toBe('abc123');
  });
});
