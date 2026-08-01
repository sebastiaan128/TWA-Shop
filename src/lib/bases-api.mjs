/**
 * Calls the site's bot endpoints.
 *
 * Same shape as the review/eod/legend integrations: a base URL plus a shared
 * key in x-api-key. The bot never touches Firestore directly, so the site
 * stays the single writer and its validation always applies.
 */

const TIMEOUT_MS = 20_000;

function config() {
  const url = process.env.BASES_API_URL;
  const key = process.env.BASES_API_KEY;
  if (!url || !key) throw new Error('BASES_API_URL or BASES_API_KEY is missing');
  return { url: url.replace(/\/$/, ''), key };
}

async function call(path, { method = 'POST', body } = {}) {
  const { url, key } = config();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, error: text.slice(0, 200) }; }
    if (!resp.ok || !data.ok) {
      // Surface the endpoint's own message: it explains what to fix, which a
      // status code does not.
      throw new Error(data?.error || `Request failed (${resp.status})`);
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The site took too long to respond.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const saveBase = (base) => call('/api/bot/bases', { body: base });
export const savePack = (pack) => call('/api/bot/packs', { body: pack });
export const listBases = (type) =>
  call(`/api/bot/bases/list?limit=25${type ? `&type=${encodeURIComponent(type)}` : ''}`, { method: 'GET' });
