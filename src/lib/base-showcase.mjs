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
 * So the showcase shows the base and points at the account. A subscriber who
 * owns the season opens it from there and gets their own link; one who does
 * not owns nothing, and the page says so.
 *
 * Everything here is plain data so the no-link guarantee can be tested without
 * a Discord client. The command turns it into an embed and a button.
 */
export function buildShowcase({ title, saved, screenshotUrl = null, siteUrl }) {
  const base = String(siteUrl || '').trim().replace(/\/+$/, '');
  // A button with no URL is rejected by Discord, and a button pointing at ""
  // would be worse than no post at all -- the builder would believe the base
  // had been announced.
  if (!base) throw new Error('BASES_API_URL is missing, so the showcase has no site url to link to');

  return {
    title: String(title || 'Base'),
    townHall: `TH${saved?.thLevel ?? '?'}${saved?.mode === 'WB' ? ' (Builder Base)' : ''}`,
    season: saved?.legendMonth || null,
    // Only the copy the site re-hosted. A Discord attachment URL is signed and
    // expires within about a day, so posting that would look right today and
    // be a broken image by tomorrow.
    imageUrl: saved?.imageHosted && screenshotUrl ? screenshotUrl : null,
    accountUrl: `${base}/account?tab=legend`,
  };
}
