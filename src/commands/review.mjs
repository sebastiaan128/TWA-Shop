import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

/**
 * /review: a rating and a sentence. Name defaults to your Discord name and the
 * clan tag is optional (it only adds your clan badge). Every rating is sent
 * to the site; the team picks which reviews are shown there, so nothing is
 * refused here for being under 5 stars or not in English.
 */
const data = new SlashCommandBuilder()
  .setName('review')
  .setDescription('Tell us how your bases held up')
  .addIntegerOption(opt => opt.setName('stars').setDescription('1 to 5 stars').setMinValue(1).setMaxValue(5).setRequired(true))
  .addStringOption(opt => opt.setName('message').setDescription('A line or two about the bases').setMinLength(10).setMaxLength(1000).setRequired(true))
  .addStringOption(opt => opt.setName('name').setDescription('Name shown with your review (default: your Discord name)').setMaxLength(40).setRequired(false))
  .addStringOption(opt => opt.setName('clantag').setDescription('Optional: your clan tag, adds your clan badge (e.g. #2PQ8RYLV)').setRequired(false));

function encodeClanTag(tag) {
  const t = tag.trim();
  return encodeURIComponent(t.startsWith('#') ? t : `#${t}`);
}

function withTimeout(ms) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(new Error('timeout')), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(id) };
}

async function fetchClan(tag, token) {
  const encoded = encodeClanTag(tag);
  const { signal, cancel } = withTimeout(10_000);
  try {
    const resp = await fetch(`https://api.clashofclans.com/v1/clans/${encoded}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      const msg = `COC API ${resp.status}: ${t.slice(0,200)}`;
      const err = new Error(msg);
      err.status = resp.status;
      err.body = t;
      throw err;
    }
    return resp.json();
  } finally {
    cancel();
  }
}

async function sendToSite(payload) {
  const url = process.env.REVIEW_API_URL;
  const key = process.env.REVIEW_API_KEY;
  if (!url || !key) return { ok: false, error: 'Missing REVIEW_API_URL or REVIEW_API_KEY' };
  try {
    const resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify(payload) });
    const text = await resp.text();
    console.log('[review] submit status', resp.status);
    try { return { ok: resp.ok, status: resp.status, data: JSON.parse(text) }; } catch { return { ok: resp.ok, status: resp.status, data: text }; }
  } catch (e) {
    console.error('[review] submit error', e);
    return { ok: false, status: 0, error: e?.message || String(e) };
  }
}

async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const stars = interaction.options.getInteger('stars', true);
  const message = interaction.options.getString('message', true);
  const name = interaction.options.getString('name')
    || interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  const clantag = (interaction.options.getString('clantag') || '').trim();

  // The clan is looked up only for its badge. Not found, or the Clash API
  // being unavailable, never costs the customer their review.
  let clan = null;
  const cocToken = process.env.COC_API_TOKEN || process.env.COC_TOKEN;
  if (clantag && cocToken) {
    try {
      clan = await fetchClan(clantag, cocToken);
    } catch (e) {
      if (e?.status !== 404) console.error('[review] clan lookup failed', e?.status || e?.message);
    }
  }

  const siteRes = await sendToSite({
    reviewerName: name,
    clanTag: clantag || null,
    clanName: clan?.name || null,
    clanBadgeUrl: clan?.badgeUrls?.medium || clan?.badgeUrls?.small || null,
    stars,
    message,
    source: 'discord',
    discordUserId: interaction.user.id,
  });

  if (!siteRes?.ok) {
    // 400s carry a message written for the customer (bad clan tag, too
    // short); anything else is ours to fix.
    const reply = siteRes?.status === 429
      ? 'You already left a review today. Thanks!'
      : siteRes?.status === 400 && siteRes?.data?.error
        ? siteRes.data.error
        : 'Something went wrong sending your review. Please try again in a moment.';
    return interaction.editReply(reply);
  }

  const embed = new EmbedBuilder()
    .setTitle('Thanks for your review!')
    .addFields(
      { name: 'Rating', value: `${'\u2B50'.repeat(stars)} (${stars}/5)`, inline: true },
      { name: 'Name', value: name.slice(0, 100), inline: true },
      ...(clan?.name ? [{ name: 'Clan', value: `${clan.name} (${clan.tag})`, inline: true }] : []),
      { name: 'Review', value: message.slice(0, 1000) },
    )
    .setColor(0x2a6fae);
  if (clan?.badgeUrls?.medium) embed.setThumbnail(clan.badgeUrls.medium);

  return interaction.editReply({ content: 'Your review is in. The team reads every one, and the best ones go on the site.', embeds: [embed] });
}

export default { data, execute };
