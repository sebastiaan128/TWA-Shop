import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import review from './review.mjs';

function interaction(opts) {
  const replies = [];
  return {
    replies,
    user: { id: '42', username: 'rens_cc', globalName: 'Rens' },
    member: { displayName: 'Big Rens' },
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async (r) => { replies.push(r); }),
    options: {
      getInteger: (n) => opts[n] ?? null,
      getString: (n) => opts[n] ?? null,
    },
  };
}

describe('/review', () => {
  let sent;
  beforeEach(() => {
    sent = [];
    process.env.REVIEW_API_URL = 'https://site/api/reviews/submit';
    process.env.REVIEW_API_KEY = 'k';
    delete process.env.COC_API_TOKEN;
    delete process.env.COC_TOKEN;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, id: 'r1' }), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('needs only stars and a message; name defaults to the server display name', async () => {
    const i = interaction({ stars: 3, message: 'Solid bases, one got tripled.' });
    await review.execute(i);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ reviewerName: 'Big Rens', stars: 3, clanTag: null, discordUserId: '42', source: 'discord' });
    expect(i.replies[0].content).toMatch(/review is in/);
  });

  it('sends every rating, including 1 star, instead of refusing it', async () => {
    await review.execute(interaction({ stars: 1, message: 'Not for me, sorry about that.' }));
    expect(sent[0].body.stars).toBe(1);
  });

  it('passes the site message back for invalid input', async () => {
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ ok: false, error: 'That clan tag does not look right.' }), { status: 400 }));
    const i = interaction({ stars: 5, message: 'Great bases all season long!', clantag: 'zzz' });
    await review.execute(i);
    expect(i.replies[0]).toBe('That clan tag does not look right.');
  });

  it('says so when a review was already left today', async () => {
    fetch.mockImplementationOnce(async () => new Response('{"ok":false}', { status: 429 }));
    const i = interaction({ stars: 5, message: 'Great bases all season long!' });
    await review.execute(i);
    expect(i.replies[0]).toMatch(/already left a review today/);
  });
});
