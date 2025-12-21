import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('review')
  .setDescription('Submit a review for your purchase (only 5-star reviews in English appear on the site)')
  .addStringOption(opt => opt.setName('name').setDescription('Your display name for the review').setRequired(true))
  .addStringOption(opt => opt.setName('clantag').setDescription('Clash of Clans clan tag (e.g. #AB12CD)').setRequired(true))
  .addIntegerOption(opt => opt.setName('stars').setDescription('Number of stars (1-5)').setMinValue(1).setMaxValue(5).setRequired(true))
  .addStringOption(opt => opt.setName('message').setDescription('Your review (English only)').setRequired(true));

function encodeClanTag(tag) {
  const t = tag.trim();
  return encodeURIComponent(t.startsWith('#') ? t : `#${t}`);
}

function englishCheck(text) {
  const s = (text || '').toString();
  const letters = s.match(/[A-Za-z]/g)?.length || 0;
  const total = s.length || 1;
  const ratio = letters / total;
  const common = /( the | and | you | your | i | we | is | are | with | for | best | great | amazing | love )/i.test(` ${s} `);
  const isEnglishEnough = ratio >= 0.5 && common;
  return { ratio, common, isEnglishEnough };
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
  await interaction.deferReply({ ephemeral: true });
  const name = interaction.options.getString('name', true);
  const clantag = interaction.options.getString('clantag', true);
  const stars = interaction.options.getInteger('stars', true);
  const message = interaction.options.getString('message', true);

  const cocToken = process.env.COC_API_TOKEN;
  if (!cocToken) {
    return interaction.editReply('Missing COC_API_TOKEN in .env (ask admin to set it).');
  }

  let clan;
  let fallbackNote = '';
  try {
    clan = await fetchClan(clantag, cocToken);
  } catch (e) {
    console.error('COC fetch error', e);
    if (e?.status === 404) {
      return interaction.editReply('Clan not found. Check the tag (include #).');
    }
    clan = { name: null, tag: clantag, badgeUrls: {} };
    if (e?.status === 403) fallbackNote = ' (Clash API blocked: update allowed IP in developer portal)';
    else if (e?.status === 429) fallbackNote = ' (Clash API rate limited: submitted without logo)';
    else if (String(e?.message || '').includes('timeout')) fallbackNote = ' (Clash API timeout: submitted without logo)';
    else fallbackNote = ' (Clash API issue: submitted without logo)';
  }

  const englishInfo = englishCheck(message);
  const english = englishInfo.isEnglishEnough;
  const eligible = english && stars === 5;

  const embed = new EmbedBuilder()
    .setTitle('New Review')
    .addFields(
      { name: 'Name', value: name, inline: true },
      { name: 'Stars', value: `${stars} / 5`, inline: true },
      { name: 'Clan', value: `${clan?.name || 'Unknown'} (${clan?.tag || clantag})` },
      { name: 'Message', value: message.slice(0, 1000) }
    )
    .setColor(eligible ? 0x22c55e : 0xf59e0b);
  if (clan?.badgeUrls?.medium) embed.setThumbnail(clan.badgeUrls.medium);

  let siteRes = null;
  if (eligible) {
    siteRes = await sendToSite({
      reviewerName: name,
      clanTag: clan?.tag || clantag,
      clanName: clan?.name || null,
      clanBadgeUrl: clan?.badgeUrls?.medium || clan?.badgeUrls?.small || null,
      stars,
      message,
      source: 'discord',
      discordUserId: interaction.user.id,
    });
  }

  let siteMsg;
  if (eligible) {
    siteMsg = siteRes?.ok
      ? 'Your review has been submitted and will appear on the site.'
      : `Your review qualifies, but submitting to the site failed (${siteRes?.status || 'n/a'}).`;
  } else {
    const needsStars = stars !== 5;
    const needsEnglish = !english;
    if (needsStars && needsEnglish) {
      siteMsg = 'Your review can be published once you set 5 stars and write a clear English sentence. Please try again.';
    } else if (needsStars) {
      siteMsg = 'Set 5 stars to have your review published.';
    } else if (needsEnglish) {
      siteMsg = 'Please write a clear English sentence (avoid one-word or emoji-only reviews), then try again.';
    } else {
      siteMsg = 'Please adjust your review and try again.';
    }
  }
  if (fallbackNote && siteRes?.ok) siteMsg += fallbackNote;

  await interaction.editReply({ content: siteMsg, embeds: [embed] });
}

export default { data, execute };
