import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractKnowledgeSnapshot,
  prepareKnowledgeSnapshot,
  sanitizeCaptureText,
  sanitizeCaptureUrl,
} from '../src/utils/knowledge-snapshot.util';

describe('Knowledge snapshot boundary', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('captures visible page text without forms, hidden content or executable payloads', () => {
    document.body.innerHTML =
      '<main>Public evidence <script>apiKey="secret"</script><style>.a{}</style><form><label>Private label</label><input value="password"><textarea>Private form value</textarea></form><div hidden>hidden secret</div><div style="display:none">CSS secret</div><div contenteditable="true">Unsent draft</div><div data-private>Private block</div><p>Final evidence</p></main>';
    expect(extractKnowledgeSnapshot().text).toBe(
      'Public evidence\nFinal evidence',
    );
  });

  it('captures only the selected passage and omits form selections', () => {
    document.body.innerHTML =
      '<p>prefix selected suffix</p><textarea>private</textarea>';
    const text = document.querySelector('p')?.firstChild;
    if (!text) throw new Error('Missing fixture');
    const range = document.createRange();
    range.setStart(text, 7);
    range.setEnd(text, 15);
    window.getSelection()?.addRange(range);
    expect(extractKnowledgeSnapshot('selection').text).toBe('selected');
    window.getSelection()?.removeAllRanges();
    range.selectNodeContents(document.querySelector('textarea') as Node);
    window.getSelection()?.addRange(range);
    expect(() => extractKnowledgeSnapshot('selection')).toThrow(
      'Select visible page text',
    );
  });

  it('captures one social post instead of the authenticated timeline', () => {
    document.body.innerHTML =
      '<main><article><a href="https://x.com/a/status/1">First</a><p>Chosen post</p></article><article><a href="https://x.com/b/status/2">Second</a><p>Other post</p></article></main>';
    expect(
      extractKnowledgeSnapshot('social', 'https://x.com/i/status/1').text,
    ).toBe('First\nChosen post');
    expect(() =>
      extractKnowledgeSnapshot('social', 'https://x.com/a/status/999'),
    ).toThrow('not visible');
  });

  it('matches a Reddit canonical capture URL to its visible subreddit permalink', () => {
    document.body.innerHTML =
      '<shreddit-post><a href="https://www.reddit.com/r/example/comments/abc123/a_title/">Post title</a><p>Useful discussion</p></shreddit-post><shreddit-post>Other post</shreddit-post>';
    expect(
      extractKnowledgeSnapshot('social', 'https://reddit.com/comments/abc123')
        .text,
    ).toBe('Post title\nUseful discussion');
  });

  it('does not include page text in a link capture', () => {
    document.body.innerHTML = '<main>Private page text</main>';
    expect(
      extractKnowledgeSnapshot('link', 'https://example.com/article').text,
    ).toBe('');
  });

  it('strips credential URL components and preserves useful query parameters', () => {
    const credentialUrl = new URL(
      'https://example.com/a?q=research&token=secret&signature=s&code=c&utm_source=x#access_token=secret',
    );
    credentialUrl.username = 'test-user';
    credentialUrl.password = 'test-password';
    expect(sanitizeCaptureUrl(credentialUrl.toString())).toBe(
      'https://example.com/a?q=research',
    );
    expect(() => sanitizeCaptureUrl('javascript:alert(1)')).toThrow('HTTP');
    expect(() => sanitizeCaptureUrl('file:///private/document')).toThrow(
      'HTTP',
    );
  });

  it('redacts pasted credentials and authenticated URLs', () => {
    const text = sanitizeCaptureText(
      'Evidence Bearer abc.123 password=hunter2 https://example.com/?access_token=secret',
    );
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('abc.123');
    expect(text).not.toContain('secret');
    expect(text).toContain('Evidence');
  });

  it('rejects oversized captures rather than silently truncating evidence', () => {
    expect(() =>
      prepareKnowledgeSnapshot({
        mode: 'page',
        title: 'Large',
        url: 'https://example.com',
        text: 'a'.repeat(200_001),
      }),
    ).toThrow('too large');
  });
});
