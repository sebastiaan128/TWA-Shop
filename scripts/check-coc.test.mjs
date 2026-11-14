import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkCoc } from './check-coc.mjs';
describe('read-only CoC connection check', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('verifies the configured proxy with GET only and never returns the secret', async () => {
    vi.stubEnv('COC_API_BASE_URL', 'https://cocproxy.royaleapi.dev/v1');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ tag: '#P0', name: 'Probe', members: 20 })));
    const result = await checkCoc({ token: 'fake-secret', clanTag: '#P0', fetchImpl });
    expect(result).toMatchObject({ ok: true, members: 20 });
    expect(JSON.stringify(result)).not.toContain('fake-secret');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://cocproxy.royaleapi.dev/v1/clans/%23P0');
    expect(fetchImpl.mock.calls[0][1].method).toBeUndefined();
  });
  it('fails on invalid credentials or misleading successful payloads', async () => {
    await expect(checkCoc({ token: 'fake', fetchImpl: async () => new Response('{}', { status: 403 }) })).rejects.toThrow(/HTTP 403/);
    await expect(checkCoc({ token: 'fake', fetchImpl: async () => new Response('{}') })).rejects.toThrow(/invalid clan payload/);
  });
});
