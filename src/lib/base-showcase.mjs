/**
 * The public message a builder posts to show off a base they just added.
 *
 * WHY THIS CARRIES NO LAYOUT LINK
 *
 * Legend subs are delivered through a per-person `/r/<token>` link, which is
 * the only reason a download can be attributed to anyone at all. A builder
 * channel is read by every subscriber, so a layout link posted here is one
 * link they all share -- and the download log, the leak signal and the alerts
 * built on top of it are worth nothing the moment that happens.
 *
 * So the button points at /base/<id> instead. That page asks the site for the
 * signed-in viewer's own token and forwards to it, which is what keeps every
 * download attributable even though everybody clicks the same button.
 *
 * Everything here is plain data so the no-link guarantee can be tested without
 * a Discord client. The command turns it into an embed and a button.
 */
const HUNDRED = '\u{1F4AF}';
const SWORD = '<:blue_sword_rank_icon:1378042079879364721>';

export function buildShowcase({ title, saved, screenshotUrl = null, siteUrl }) {
  const base = String(siteUrl || '').trim().replace(/\/+$/, '');
  // A button with no URL is rejected by Discord, and a button pointing at ""
  // would be worse than no post at all -- the builder would believe the base
  // had been announced.
  if (!base) throw new Error('BASES_API_URL is missing, so the showcase has no site url to link to');
  // Without an id the button would point at /base/, which is a 404 dressed up
  // as a working post -- worse than refusing, because the builder would
  // believe the base had been shared.
  if (!saved?.id) throw new Error('the site did not return a base id, so there is nothing to link to');

  return {
    // Sent as the literal character and as <:name:id>, because Discord only
    // turns :shortcode: into an emoji for text a person types -- a bot's
    // message keeps it as the words. A custom emoji additionally needs its
    // id, or it renders as plain text in every client.
    title: `${SWORD} ${String(title || 'Base')} ${HUNDRED}`,
    townHall: `TH${saved?.thLevel ?? '?'}${saved?.mode === 'WB' ? ' (Builder Base)' : ''}`,
    season: saved?.legendMonth || null,
    // Only the copy the site re-hosted. A Discord attachment URL is signed and
    // expires within about a day, so posting that would look right today and
    // be a broken image by tomorrow.
    imageUrl: saved?.imageHosted && screenshotUrl ? screenshotUrl : null,
    // One URL for everyone in the channel, because a Discord button cannot
    // carry an identity. The site resolves the viewer's OWN token behind it,
    // so the download stays attributable to one person.
    openUrl: `${base}/base/${encodeURIComponent(saved?.id || '')}`,
  };
}
