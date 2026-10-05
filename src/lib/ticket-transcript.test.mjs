import { describe, it, expect } from 'vitest';
import { buildTranscriptHtml } from './ticket-transcript.mjs';

describe('buildTranscriptHtml', () => {
  const channel = { name: '💎-ticket-0004' };

  it('returns a self-contained HTML document with the channel name', () => {
    const out = buildTranscriptHtml([], channel);
    expect(out).toMatch(/^<!DOCTYPE html>/);
    expect(out).toContain('<html');
    expect(out).toContain('</html>');
    expect(out).toContain('💎-ticket-0004');
    expect(out).toContain('0 message');
  });

  it('renders one row per message, oldest first', () => {
    const messages = [
      { id: '2', timestamp: '2026-06-21T10:01:00.000Z', author: { username: 'bob' }, content: 'second' },
      { id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'alice' }, content: 'first' },
    ];
    const out = buildTranscriptHtml(messages, channel);
    const aliceIdx = out.indexOf('alice');
    const bobIdx = out.indexOf('bob');
    expect(aliceIdx).toBeGreaterThan(-1);
    expect(bobIdx).toBeGreaterThan(aliceIdx); // chronological
    expect(out).toContain('first');
    expect(out).toContain('second');
  });

  it('prefers global_name over username for the author label', () => {
    const messages = [{ id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'alice', global_name: 'Alice A' }, content: 'hi' }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('Alice A');
  });

  it('escapes HTML in message content and author/channel names', () => {
    const messages = [{ id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: '<b>x</b>' }, content: '<script>alert(1)</script>' }];
    const out = buildTranscriptHtml(messages, { name: '<i>chan</i>' });
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(out).toContain('&lt;i&gt;chan&lt;/i&gt;');
  });

  it('renders an image attachment as an <img> and a non-image as a link', () => {
    const messages = [{
      id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'alice' }, content: '',
      attachments: [
        { url: 'https://cdn.example/pic.png', filename: 'pic.png', content_type: 'image/png' },
        { url: 'https://cdn.example/doc.txt', filename: 'doc.txt', content_type: 'text/plain' },
      ],
    }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('<img');
    expect(out).toContain('https://cdn.example/pic.png');
    expect(out).toContain('href="https://cdn.example/doc.txt"');
    expect(out).toContain('doc.txt');
  });

  it('renders embed title, description and fields', () => {
    const messages = [{
      id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'alice' }, content: '',
      embeds: [{
        title: 'Order delivered',
        description: 'Here are your bases',
        fields: [{ name: 'Season', value: 'July 2026', inline: true }],
        image: { url: 'https://cdn.example/base.png' },
        footer: { text: 'Delivered by staff' },
      }],
    }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('Order delivered');
    expect(out).toContain('Here are your bases');
    expect(out).toContain('Season');
    expect(out).toContain('July 2026');
    expect(out).toContain('https://cdn.example/base.png');
    expect(out).toContain('Delivered by staff');
    expect(out).not.toContain('1 embed');
  });

  it('escapes HTML inside embed content', () => {
    const messages = [{
      id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'alice' }, content: '',
      embeds: [{ title: '<script>x</script>', description: '<b>d</b>' }],
    }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(out).toContain('&lt;b&gt;d&lt;/b&gt;');
    expect(out).not.toContain('<script>x</script>');
  });

  it('preserves newlines in content as <br>', () => {
    const messages = [{ id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'alice' }, content: 'line1\nline2' }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('line1<br>line2');
  });

  it('does not emit javascript: or data: URLs in href/src', () => {
    const messages = [{
      id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'mallory' }, content: '',
      embeds: [{
        title: 'click', url: 'javascript:alert(1)',
        image: { url: 'javascript:alert(2)' },
      }],
      attachments: [
        { url: 'javascript:alert(3)', filename: 'evil.txt', content_type: 'text/plain' },
        { url: 'data:text/html,<script>1</script>', filename: 'evil.png', content_type: 'image/png' },
      ],
    }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).not.toContain('href="javascript:');
    expect(out).not.toContain('src="javascript:');
    expect(out).not.toContain('href="data:');
    expect(out).not.toContain('src="data:');
    // safe content still rendered
    expect(out).toContain('click');
    expect(out).toContain('evil.txt');
  });

  it('still emits valid https image and link URLs', () => {
    const messages = [{
      id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'alice' }, content: '',
      attachments: [{ url: 'https://cdn.example/ok.png', filename: 'ok.png', content_type: 'image/png' }],
    }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('src="https://cdn.example/ok.png"');
  });

  it('keeps underscores inside names instead of italicising them', () => {
    const messages = [{ id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'bot' }, content: '**dictator_pucis_63602** and _real italic_' }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('<strong>dictator_pucis_63602</strong>');
    expect(out).toContain('<em>real italic</em>');
  });

  it('marks a message with nothing visible instead of rendering an empty row', () => {
    const messages = [{ id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'staff' }, content: '', embeds: [], attachments: [] }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('class="meta"');
    expect(out).toMatch(/content not available/i);
  });

  it('groups consecutive messages from one author like Discord', () => {
    const a = { id: '111', username: 'alice', avatar: 'abc123' };
    const messages = [
      { id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: a, content: 'one' },
      { id: '2', timestamp: '2026-06-21T10:01:00.000Z', author: a, content: 'two' },
      { id: '3', timestamp: '2026-06-21T10:30:00.000Z', author: a, content: 'three' },
    ];
    const out = buildTranscriptHtml(messages, channel);
    expect(out.match(/class="msg first"/g)).toHaveLength(2); // 30 min gap splits
    expect(out.match(/class="msg cont"/g)).toHaveLength(1);
    expect(out).toContain('src="https://cdn.discordapp.com/avatars/111/abc123.png?size=80"');
  });

  it('uses a default avatar and rejects a malformed avatar hash', () => {
    const messages = [{ id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { id: '222', username: 'x', avatar: '"><script>' }, content: 'hi' }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('https://cdn.discordapp.com/embed/avatars/');
    expect(out).not.toContain('"><script>');
  });

  it('tags bots and renders a reply preview', () => {
    const bot = { id: '9', username: 'Twa-Shop', bot: true };
    const user = { id: '8', username: 'bob' };
    const messages = [
      { id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: bot, content: 'Welcome' },
      { id: '2', type: 19, timestamp: '2026-06-21T10:01:00.000Z', author: user, content: 'thanks',
        referenced_message: { id: '1', author: bot, content: 'Welcome' } },
    ];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('class="bot-tag"');
    expect(out).toContain('class="reply"');
    expect(out).toContain('href="#m-1"');
  });

  it('renders stickers by name', () => {
    const messages = [{ id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'alice' }, content: '', sticker_items: [{ id: '9', name: 'Wave' }] }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('Wave');
    expect(out).not.toMatch(/content not available/i);
  });
  it('turns <url> into a link and leaves trailing punctuation outside it', () => {
    const messages = [{ id: '1', timestamp: '2026-06-21T10:00:00.000Z', author: { username: 'bot' }, content: 'see <https://twabases.com/account?tab=packs>, thanks' }];
    const out = buildTranscriptHtml(messages, channel);
    expect(out).toContain('href="https://twabases.com/account?tab=packs"');
    expect(out).toContain('</a>, thanks');
    expect(out).not.toContain('&lt;https');
  });
});
