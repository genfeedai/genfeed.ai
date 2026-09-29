import { describe, expect, it } from 'vitest';
import {
  harnessEditorHtmlToLines,
  harnessLinesToEditorHtml,
} from './harness-content.helpers';

describe('harnessLinesToEditorHtml', () => {
  it('splits a newline-joined string into paragraphs', () => {
    expect(harnessLinesToEditorHtml('Hook\nProof\n\n')).toBe(
      '<p>Hook</p><p>Proof</p>',
    );
  });
});

describe('harnessEditorHtmlToLines', () => {
  it('round-trips through harnessLinesToEditorHtml', () => {
    const lines = ['Hook', 'One idea per line', 'BAM conclusion'];
    const html = harnessLinesToEditorHtml(lines);
    expect(harnessEditorHtmlToLines(html).split('\n')).toEqual(lines);
  });
});
