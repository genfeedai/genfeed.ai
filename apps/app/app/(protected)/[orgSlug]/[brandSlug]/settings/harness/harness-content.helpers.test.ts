import { describe, expect, it } from 'vitest';
import {
  harnessEditorHtmlToLines,
  harnessLinesToEditorHtml,
} from './harness-content.helpers';

describe('harnessLinesToEditorHtml', () => {
  it('renders one paragraph per non-empty array line', () => {
    expect(harnessLinesToEditorHtml(['Hook', 'Proof', ''])).toBe(
      '<p>Hook</p><p>Proof</p>',
    );
  });

  it('splits a newline-joined string into paragraphs', () => {
    expect(harnessLinesToEditorHtml('Hook\nProof\n\n')).toBe(
      '<p>Hook</p><p>Proof</p>',
    );
  });

  it('escapes HTML-significant characters', () => {
    expect(harnessLinesToEditorHtml(['<script>alert(1)</script>'])).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });

  it('returns an empty string for undefined or empty input', () => {
    expect(harnessLinesToEditorHtml(undefined)).toBe('');
    expect(harnessLinesToEditorHtml([])).toBe('');
  });
});

describe('harnessEditorHtmlToLines', () => {
  it('converts paragraph blocks back into newline-joined plain text', () => {
    expect(harnessEditorHtmlToLines('<p>Hook</p><p>Proof</p>')).toBe(
      'Hook\nProof',
    );
  });

  it('treats <br> tags as line breaks', () => {
    expect(harnessEditorHtmlToLines('<p>Hook<br>Proof</p>')).toBe(
      'Hook\nProof',
    );
  });

  it('decodes HTML entities and drops empty lines', () => {
    expect(harnessEditorHtmlToLines('<p>Ship &amp; iterate</p><p></p>')).toBe(
      'Ship & iterate',
    );
  });

  it('round-trips through harnessLinesToEditorHtml', () => {
    const lines = ['Hook', 'One idea per line', 'BAM conclusion'];
    const html = harnessLinesToEditorHtml(lines);
    expect(harnessEditorHtmlToLines(html).split('\n')).toEqual(lines);
  });
});
