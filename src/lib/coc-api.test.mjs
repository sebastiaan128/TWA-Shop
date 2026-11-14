import { describe, it, expect, vi, afterEach } from 'vitest';
import { cocApiBase } from './coc-api.mjs';
describe('CoC endpoint', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('defaults to official API and accepts the approved proxy explicitly', () => {
    vi.stubEnv('COC_API_BASE_URL', undefined);
    expect(cocApiBase()).toBe('https://api.clashofclans.com/v1');
    vi.stubEnv('COC_API_BASE_URL', 'https://cocproxy.royaleapi.dev/v1/');
    expect(cocApiBase()).toBe('https://cocproxy.royaleapi.dev/v1');
  });
  it('rejects arbitrary endpoints before any token is sent', () => {
    for (const base of ['http://cocproxy.royaleapi.dev/v1', 'https://evil.test/v1', 'https://cocproxy.royaleapi.dev.evil.test/v1', 'https://user:secret@cocproxy.royaleapi.dev/v1']) expect(() => cocApiBase(base)).toThrow(/COC_API_BASE_URL/);
  });
});
