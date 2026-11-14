import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { cocApiBase } from '../src/lib/coc-api.mjs';

// Read-only probe: never logs tokens or invokes a Discord/site mutation.
export async function checkCoc({
  token = process.env.COC_API_TOKEN || process.env.COC_TOKEN,
  clanTag = process.env.COC_CHECK_CLAN_TAG || '#2JPVV99RP',
  fetchImpl = fetch,
} = {}) {
  if (!token) throw new Error('COC_API_TOKEN is required for the connection check');
  if (!/^#[0289PYLQGRJCUV]+$/.test(clanTag)) throw new Error('Invalid COC_CHECK_CLAN_TAG');
  const base = cocApiBase();
  const response = await fetchImpl(`${base}/clans/${encodeURIComponent(clanTag)}`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`CoC connection check failed: HTTP ${response.status}`);
  const clan = await response.json();
  if (typeof clan.tag !== 'string' || typeof clan.name !== 'string' || !Number.isInteger(clan.members)) throw new Error('CoC connection check returned an invalid clan payload');
  return { ok: true, endpoint: base, clan: clan.tag, members: clan.members };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkCoc().then((result) => console.log('[coc-check]', JSON.stringify(result)))
    .catch((error) => { console.error('[coc-check]', error.message); process.exitCode = 1; });
}
