// Build an HTML transcript from raw Discord REST message objects.
// Pure: no network. Used by the bot's Close button here and, in
// TW-architects/functions/lib/ticket-transcript.js, by the admin panel, so both
// produce the same transcript. Keep the two in step.
// The layout mirrors the Discord client (avatars, grouped messages, day
// separators, replies) so staff read it the way they read the ticket.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only http(s) URLs may be emitted into href/src, blocks javascript:/data: XSS
// from attacker-controlled message/embed content. Returns the URL or '' if unsafe.
function safeUrl(value) {
  try {
    const u = new URL(String(value ?? ''));
    return (u.protocol === 'http:' || u.protocol === 'https:') ? String(value) : '';
  } catch {
    return '';
  }
}

function authorLabel(author = {}) {
  return author.global_name || author.username || 'unknown';
}

// Avatar URLs are built from the snowflake and hash, never taken verbatim, so
// both parts are validated before they reach a src attribute.
function avatarUrl(author = {}) {
  const id = String(author.id || '');
  const hash = String(author.avatar || '');
  if (/^\d+$/.test(id) && /^(a_)?[0-9a-f]+$/i.test(hash)) {
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=80`;
  }
  // Discord's default avatar for accounts without one.
  const idx = /^\d+$/.test(id) ? Number((BigInt(id) >> 22n) % 6n) : 0;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function isImageAttachment(a = {}) {
  if (typeof a.content_type === 'string' && a.content_type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(a.url || a.filename || '');
}

// Server-side fallback text; the inline script swaps in the viewer's local time.
function utcStamp(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function timeTag(iso, mode, fallback) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(fallback || '');
  return `<time datetime="${escapeHtml(d.toISOString())}" data-fmt="${mode}">${escapeHtml(fallback)}</time>`;
}

// Discord sends its own markdown. Previously this only escaped and broke lines,
// so a transcript showed literal **bold**, backticks and <@1234> instead of
// formatted text and mentions.
//
// Escaping happens first and everything below operates on already-escaped text,
// so no user content can inject markup. That is also why the mention and emoji
// patterns match &lt; and &gt; rather than < and >.
function renderContent(content, mentions) {
  let out = escapeHtml(content || '');

  // Named users, when the caller has them, so a mention reads as @name rather
  // than a raw snowflake.
  const nameById = new Map(
    (Array.isArray(mentions) ? mentions : []).map((u) => [String(u?.id), u?.global_name || u?.username])
  );

  // Fenced code first: its contents must not pick up any other formatting.
  const blocks = [];
  out = out.replace(/```(?:[a-zA-Z0-9+#.-]*\n)?([\s\S]*?)```/g, (_m, code) => {
    blocks.push(code.replace(/\n$/, ''));
    return `<<<BLOCK${blocks.length - 1}>>>`;
  });

  const inline = [];
  out = out.replace(/`([^`\n]+)`/g, (_m, code) => {
    inline.push(code);
    return `<<<CODE${inline.length - 1}>>>`;
  });

  out = out
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    // Discord only italicises _x_ at word boundaries, so a username such as
    // dictator_pucis_63602 must keep its underscores.
    .replace(/(^|\W)_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/^#{1,3} (.*)$/gm, (_m, text) => `<span class="h">${text}</span>`)
    .replace(/^&gt; (.*)$/gm, '<span class="quote">$1</span>');

  // Mentions, channels, roles, custom emoji and timestamps.
  out = out
    .replace(/&lt;@!?(\d+)&gt;/g, (_m, id) => `<span class="mention">@${escapeHtml(nameById.get(id) || id)}</span>`)
    .replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role</span>')
    .replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#channel</span>')
    .replace(/&lt;(a?):(\w+):(\d+)&gt;/g, (_m, anim, name, id) =>
      `<img class="emoji" src="https://cdn.discordapp.com/emojis/${id}.${anim ? 'gif' : 'webp'}?size=44" alt=":${name}:" title=":${name}:">`)
    .replace(/&lt;t:(\d+)(?::[tTdDfFR])?&gt;/g, (_m, secs) => {
      const d = new Date(Number(secs) * 1000);
      return Number.isNaN(d.getTime())
        ? _m
        : `<span class="stamp">${timeTag(d.toISOString(), 'full', d.toISOString().replace('T', ' ').slice(0, 16))}</span>`;
    });

  // <https://…> is Discord's link-without-preview syntax.
  out = out.replace(/&lt;(https?:\/\/[^\s<]+?)&gt;/g, ' $1');

  // Bare links, skipping anything already inside an attribute.
  // Trailing punctuation belongs to the sentence, not the URL.
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+?)([.,!?:;]*)(?=$|[\s<)])/g,
    (_m, pre, url, tail) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${tail}`);

  out = out
    .replace(/<<<CODE(\d+)>>>/g, (_m, i) => `<code>${inline[Number(i)]}</code>`)
    .replace(/<<<BLOCK(\d+)>>>/g, (_m, i) => `<pre><code>${blocks[Number(i)]}</code></pre>`);

  return out.replace(/\n/g, '<br>');
}

function renderAttachment(a) {
  const safe = safeUrl(a.url);
  const name = escapeHtml(a.filename || a.url || 'attachment');
  if (isImageAttachment(a) && safe) {
    return `<div class="att"><a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(safe)}" alt="${name}" loading="lazy"></a></div>`;
  }
  const size = typeof a.size === 'number' ? `<div class="file-size">${(a.size / 1024).toFixed(1)} KB</div>` : '';
  const label = safe
    ? `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${name}</a>`
    : `<span>${name}</span>`;
  return `<div class="att file"><div class="file-icon">📄</div><div class="file-meta">${label}${size}</div></div>`;
}

function colorHex(color) {
  if (typeof color !== 'number' || color < 0) return '#1e1f22';
  return `#${color.toString(16).padStart(6, '0')}`;
}

function renderEmbedField(f = {}) {
  const name = renderContent(f.name || '');
  const value = renderContent(f.value || '');
  const inline = f.inline ? ' inline' : '';
  return `<div class="embed-field${inline}"><div class="embed-field-name">${name}</div><div class="embed-field-value">${value}</div></div>`;
}

function renderEmbed(embed = {}) {
  const bar = colorHex(embed.color);
  const parts = [];
  if (embed.author?.name) {
    const icon = safeUrl(embed.author.icon_url);
    parts.push(`<div class="embed-author">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : ''}${escapeHtml(embed.author.name)}</div>`);
  }
  if (embed.title) {
    const t = escapeHtml(embed.title);
    const safeTitleUrl = safeUrl(embed.url);
    parts.push(safeTitleUrl
      ? `<div class="embed-title"><a href="${escapeHtml(safeTitleUrl)}" target="_blank" rel="noopener noreferrer">${t}</a></div>`
      : `<div class="embed-title">${t}</div>`);
  }
  if (embed.description) parts.push(`<div class="embed-desc">${renderContent(embed.description)}</div>`);
  if (embed.fields?.length) parts.push(`<div class="embed-fields">${embed.fields.map(renderEmbedField).join('')}</div>`);
  if (embed.image?.url) {
    const safeImg = safeUrl(embed.image.url);
    if (safeImg) parts.push(`<div class="embed-image"><img src="${escapeHtml(safeImg)}" alt="embed image" loading="lazy"></div>`);
  }
  const footerBits = [];
  if (embed.footer?.text) footerBits.push(escapeHtml(embed.footer.text));
  if (embed.timestamp) footerBits.push(timeTag(embed.timestamp, 'full', utcStamp(embed.timestamp)));
  if (footerBits.length) parts.push(`<div class="embed-footer">${footerBits.join(' • ')}</div>`);

  let thumb = '';
  if (embed.thumbnail?.url) {
    const safeThumb = safeUrl(embed.thumbnail.url);
    if (safeThumb) thumb = `<img class="embed-thumb" src="${escapeHtml(safeThumb)}" alt="thumbnail" loading="lazy">`;
  }
  return `<div class="embed" style="border-left-color:${bar}"><div class="embed-body">${parts.join('')}</div>${thumb}</div>`;
}

// Discord button styles: 1 primary, 2 secondary, 3 success, 4 danger, 5 link.
const BUTTON_CLASS = { 1: 'primary', 2: 'secondary', 3: 'success', 4: 'danger', 5: 'secondary' };

function renderComponents(rows = []) {
  const html = rows
    .filter((r) => r?.type === 1 && Array.isArray(r.components))
    .map((r) => {
      const buttons = r.components
        .filter((c) => c?.type === 2)
        .map((c) => {
          const emoji = c.emoji?.name && !c.emoji.id ? `${escapeHtml(c.emoji.name)} ` : '';
          return `<span class="btn ${BUTTON_CLASS[c.style] || 'secondary'}">${emoji}${escapeHtml(c.label || '')}</span>`;
        })
        .join('');
      return buttons ? `<div class="btn-row">${buttons}</div>` : '';
    })
    .join('');
  return html;
}

function renderReactions(reactions = []) {
  if (!reactions.length) return '';
  const pills = reactions.map((r) => {
    const e = r.emoji || {};
    const glyph = e.id && /^\d+$/.test(String(e.id))
      ? `<img class="emoji" src="https://cdn.discordapp.com/emojis/${e.id}.webp?size=44" alt=":${escapeHtml(e.name || '')}:">`
      : escapeHtml(e.name || '?');
    return `<span class="reaction">${glyph}<span>${Number(r.count) || 1}</span></span>`;
  }).join('');
  return `<div class="reactions">${pills}</div>`;
}

function renderReply(ref) {
  if (!ref) return '<div class="reply"><span class="reply-missing">Original message was deleted</span></div>';
  const text = (ref.content || '').replace(/\s+/g, ' ').slice(0, 120)
    || (ref.attachments?.length ? 'Click to see attachment' : ref.embeds?.length ? 'Embed' : '');
  return `<div class="reply"><img class="reply-avatar" src="${avatarUrl(ref.author)}" alt=""><span class="reply-author">${escapeHtml(authorLabel(ref.author))}</span><a class="reply-text" href="#m-${escapeHtml(ref.id)}">${escapeHtml(text)}</a></div>`;
}

function renderBody(m) {
  const parts = [];
  if (m.content) parts.push(`<div class="content">${renderContent(m.content, m.mentions)}${m.edited_timestamp ? ' <span class="edited">(edited)</span>' : ''}</div>`);
  if (m.embeds?.length) parts.push(m.embeds.map(renderEmbed).join(''));
  if (m.attachments?.length) parts.push(m.attachments.map(renderAttachment).join(''));
  if (m.sticker_items?.length) {
    parts.push(`<div class="meta">Sticker: ${m.sticker_items.map((s) => escapeHtml(s.name || 'sticker')).join(', ')}</div>`);
  }
  // Discord returns content, embeds and attachments empty when the app lacks
  // the Message Content intent. Say so rather than show a silent blank row.
  if (!parts.length) {
    parts.push('<div class="meta">(message content not available)</div>');
  }
  const comps = renderComponents(m.components);
  if (comps) parts.push(comps);
  const reacts = renderReactions(m.reactions);
  if (reacts) parts.push(reacts);
  return parts.join('\n');
}

// Type 19 is a reply. message_reference alone also appears on forwards and
// pins, which must not render a reply bar.
function isReply(m) {
  return m.type === 19 || !!m.referenced_message;
}

// Discord folds consecutive messages from one author into a single group
// unless they are more than 7 minutes apart or the later one is a reply.
const GROUP_WINDOW_MS = 7 * 60 * 1000;

function startsGroup(m, prev) {
  if (!prev) return true;
  if (isReply(m)) return true;
  if (prev.author?.id !== m.author?.id || prev.author?.username !== m.author?.username) return true;
  return new Date(m.timestamp) - new Date(prev.timestamp) > GROUP_WINDOW_MS;
}

function renderMessage(m, prev) {
  const id = escapeHtml(m.id || '');
  const fallbackTs = m.timestamp ? m.timestamp.replace('T', ' ').slice(0, 19) : '????';
  const body = renderBody(m);

  if (!startsGroup(m, prev)) {
    return `
    <div class="msg cont" id="m-${id}" data-ts="${escapeHtml(m.timestamp || '')}">
      <span class="gutter-ts">${timeTag(m.timestamp, 'time', fallbackTs.slice(11, 16))}</span>
      <div class="body">${body}</div>
    </div>`;
  }

  const author = escapeHtml(authorLabel(m.author));
  const botTag = m.author?.bot ? '<span class="bot-tag">BOT</span>' : '';
  const reply = isReply(m) ? renderReply(m.referenced_message) : '';
  return `
    <div class="msg first" id="m-${id}" data-ts="${escapeHtml(m.timestamp || '')}">
      ${reply}
      <img class="avatar" src="${avatarUrl(m.author)}" alt="" loading="lazy">
      <div class="body">
        <div class="head"><span class="author">${author}</span>${botTag}<span class="ts">${timeTag(m.timestamp, 'full', fallbackTs)}</span></div>
        ${body}
      </div>
    </div>`;
}

export function buildTranscriptHtml(messages = [], channel = {}) {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
  const name = escapeHtml(channel.name || 'unknown');
  const exportedIso = new Date().toISOString();

  const rows = sorted.map((m, i) => renderMessage(m, sorted[i - 1]));
  const body = sorted.length
    ? rows.join('\n')
    : '<p class="empty">No messages in this channel.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Transcript, ${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #313338; --bg-alt: #2b2d31; --bg-deep: #1e1f22; --hover: #2e3035;
    --text: #dbdee1; --text-strong: #f2f3f5; --muted: #949ba4; --faint: #80848e;
    --link: #00a8fc; --blurple: #5865f2; --line: #3f4147;
  }
  * { box-sizing: border-box; }
  html { color-scheme: dark; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.375 "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 16px; background: var(--bg); border-bottom: 1px solid var(--bg-deep); box-shadow: 0 1px 0 rgba(4,4,5,.2), 0 1.5px 0 rgba(6,6,7,.05), 0 2px 0 rgba(4,4,5,.05); }
  header .hash { color: var(--faint); font-size: 24px; font-weight: 400; line-height: 1; }
  header h1 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  header .sub { margin-left: auto; padding-left: 16px; border-left: 1px solid var(--line); color: var(--muted); font-size: 14px; white-space: nowrap; }
  .intro { padding: 32px 16px 8px; }
  .intro .big-hash { width: 68px; height: 68px; border-radius: 50%; background: #41434a; display: grid; place-items: center; font-size: 40px; color: var(--text-strong); }
  .intro h2 { margin: 8px 0 4px; font-size: 32px; font-weight: 700; color: var(--text-strong); word-break: break-word; }
  .intro p { margin: 0; color: var(--muted); }
  main { padding-bottom: 32px; }
  .divider { display: flex; align-items: center; margin: 24px 16px 8px; height: 0; border-top: 1px solid var(--line); justify-content: center; }
  .divider span { background: var(--bg); padding: 0 4px; color: var(--muted); font-size: 12px; font-weight: 600; line-height: 13px; margin-top: -1px; }
  .msg { position: relative; padding: 2px 48px 2px 72px; min-height: 22px; }
  .msg.first { margin-top: 17px; }
  .divider + .msg.first { margin-top: 0; }
  .msg:hover { background: var(--hover); }
  .msg:target { background: rgba(88,101,242,.1); box-shadow: inset 2px 0 0 var(--blurple); }
  .avatar { position: absolute; left: 16px; top: 4px; width: 40px; height: 40px; border-radius: 50%; }
  .msg.first .reply ~ .avatar { top: 26px; }
  .head { display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
  .author { font-weight: 500; color: var(--text-strong); }
  .bot-tag { background: var(--blurple); color: #fff; font-size: 10px; font-weight: 600; line-height: 15px; padding: 0 4.5px; border-radius: 3px; position: relative; top: -1px; margin-left: 2px; }
  .ts { color: var(--muted); font-size: 12px; margin-left: 4px; }
  .gutter-ts { position: absolute; left: 0; width: 64px; text-align: right; color: var(--muted); font-size: 11px; line-height: 22px; visibility: hidden; }
  .msg.cont:hover .gutter-ts { visibility: visible; }
  .content { white-space: normal; overflow-wrap: anywhere; color: var(--text); }
  .content strong { font-weight: 700; }
  .edited { color: var(--muted); font-size: 10px; }
  .meta { color: var(--muted); font-size: 14px; font-style: italic; }
  .reply { display: flex; align-items: center; gap: 4px; margin-left: -56px; padding-left: 56px; position: relative; font-size: 14px; color: var(--muted); height: 22px; overflow: hidden; }
  .reply::before { content: ""; position: absolute; left: 36px; top: 10px; width: 33px; height: 12px; border-left: 2px solid #4e5058; border-top: 2px solid #4e5058; border-top-left-radius: 6px; }
  .reply-avatar { width: 16px; height: 16px; border-radius: 50%; }
  .reply-author { color: var(--text-strong); font-weight: 500; opacity: .64; white-space: nowrap; }
  .reply-text { color: #b5bac1; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .reply-text:hover { color: var(--text-strong); }
  .reply-missing { font-style: italic; }
  .content a, .embed a, .file a { color: var(--link); text-decoration: none; }
  .content a:hover, .embed a:hover, .file a:hover { text-decoration: underline; }
  .content code { background: var(--bg-alt); border: 1px solid var(--bg-deep); padding: 0 .2em; border-radius: 4px; font-size: 85%; font-family: Consolas, "Andale Mono WT", Monaco, monospace; }
  .content pre { background: var(--bg-alt); border: 1px solid var(--bg-deep); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 6px 0 0; max-width: 90%; }
  .content pre code { background: none; border: 0; padding: 0; font-size: 14px; }
  .mention { background: rgba(88,101,242,.3); color: #c9cdfb; padding: 0 2px; border-radius: 3px; font-weight: 500; }
  .mention:hover { background: var(--blurple); color: #fff; }
  .quote { display: block; border-left: 4px solid #4e5058; padding: 0 8px 0 12px; margin: 2px 0; }
  .h { display: block; font-size: 20px; font-weight: 700; color: var(--text-strong); margin: 8px 0 4px; }
  .stamp { background: rgba(78,80,88,.48); padding: 0 2px; border-radius: 3px; }
  .emoji { width: 22px; height: 22px; vertical-align: bottom; object-fit: contain; }
  .att { margin-top: 4px; }
  .att img { display: block; max-width: min(400px, 100%); max-height: 350px; border-radius: 8px; cursor: zoom-in; }
  .file { display: flex; align-items: center; gap: 8px; max-width: 432px; padding: 10px; background: var(--bg-alt); border: 1px solid var(--bg-deep); border-radius: 8px; }
  .file-icon { font-size: 28px; line-height: 1; }
  .file-meta { min-width: 0; overflow-wrap: anywhere; }
  .file-size { color: var(--muted); font-size: 12px; }
  .embed { display: flex; gap: 16px; max-width: 520px; margin-top: 4px; padding: 8px 16px 16px 12px; background: var(--bg-alt); border-left: 4px solid var(--bg-deep); border-radius: 4px; }
  .embed-body { min-width: 0; flex: 1; }
  .embed-author { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 14px; font-weight: 600; color: var(--text-strong); }
  .embed-author img { width: 24px; height: 24px; border-radius: 50%; }
  .embed-title { margin-top: 8px; font-weight: 600; color: var(--text-strong); }
  .embed-desc { margin-top: 8px; font-size: 14px; overflow-wrap: anywhere; }
  .embed-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
  .embed-field { grid-column: 1 / -1; min-width: 0; }
  .embed-field.inline { grid-column: auto; }
  .embed-field-name { font-size: 14px; font-weight: 600; color: var(--text-strong); margin-bottom: 2px; }
  .embed-field-value { font-size: 14px; overflow-wrap: anywhere; }
  .embed-image img { display: block; max-width: 100%; margin-top: 16px; border-radius: 4px; }
  .embed-thumb { width: 80px; height: 80px; object-fit: contain; border-radius: 4px; margin-top: 8px; flex-shrink: 0; }
  .embed-footer { margin-top: 8px; color: var(--muted); font-size: 12px; font-weight: 500; }
  .btn-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .btn { display: inline-flex; align-items: center; height: 32px; padding: 2px 16px; border-radius: 3px; font-size: 14px; font-weight: 500; color: #fff; cursor: default; }
  .btn.primary { background: var(--blurple); }
  .btn.secondary { background: #4e5058; }
  .btn.success { background: #248046; }
  .btn.danger { background: #da373c; }
  .reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .reaction { display: inline-flex; align-items: center; gap: 6px; padding: 2px 6px; background: var(--bg-alt); border: 1px solid transparent; border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--muted); }
  .reaction .emoji { width: 16px; height: 16px; }
  .empty { color: var(--muted); padding: 16px; }
  footer { padding: 16px; color: var(--faint); font-size: 12px; text-align: center; border-top: 1px solid var(--line); }
  @media (max-width: 600px) {
    header .sub { display: none; }
    .msg { padding-right: 16px; }
    .embed-fields { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<header>
  <span class="hash">#</span>
  <h1>${name}</h1>
  <span class="sub">${sorted.length} message(s)</span>
</header>
<div class="intro">
  <div class="big-hash">#</div>
  <h2>Welcome to #${name}!</h2>
  <p>This is the start of the #${name} channel.</p>
</div>
<main>
${body}
</main>
<footer>Exported ${sorted.length} message(s) on ${timeTag(exportedIso, 'full', utcStamp(exportedIso))}</footer>
<script>
  // Render times in the viewer's locale, the way Discord does. Day
  // separators are placed here too, because which day a message falls on
  // depends on the viewer's timezone.
  (function () {
    var lastDay = null;
    document.querySelectorAll('.msg[data-ts]').forEach(function (el) {
      var d = new Date(el.getAttribute('data-ts'));
      if (isNaN(d)) return;
      var day = d.toDateString();
      if (day === lastDay) return;
      lastDay = day;
      var div = document.createElement('div');
      div.className = 'divider';
      var span = document.createElement('span');
      span.textContent = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      div.appendChild(span);
      el.parentNode.insertBefore(div, el);
      el.classList.add('day-start');
    });
    var fmt = {
      full: { dateStyle: 'short', timeStyle: 'short' },
      time: { timeStyle: 'short' },
    };
    document.querySelectorAll('time[data-fmt]').forEach(function (el) {
      var d = new Date(el.getAttribute('datetime'));
      if (isNaN(d)) return;
      try { el.textContent = d.toLocaleString(undefined, fmt[el.dataset.fmt] || fmt.full); } catch (e) {}
      el.title = d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
    });
  })();
</script>
</body>
</html>`;
}
