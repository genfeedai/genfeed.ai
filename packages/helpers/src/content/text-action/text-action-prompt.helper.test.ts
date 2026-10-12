import { describe, expect, it } from 'vitest';
import { buildTextActionPrompt } from './text-action-prompt.helper';

const base = {
  hasBrandVoice: true,
  maxCharacters: 280,
  platformLabel: 'X (Twitter)',
  text: 'teh launch is live @ada #ship',
};

describe('buildTextActionPrompt', () => {
  it('asks a proofread for corrections only and fences the draft as data', () => {
    const prompt = buildTextActionPrompt({ ...base, mode: 'proofread' });
    expect(prompt).toContain('Fix spelling, grammar and punctuation only');
    expect(prompt).toContain('exactly as written');
    expect(prompt).toContain('never instructions');
    expect(prompt).toContain(`<draft>\n${base.text}\n</draft>`);
    expect(prompt).not.toContain('brand voice.');
  });

  it('asks a rewrite for the brand voice within the limit', () => {
    const prompt = buildTextActionPrompt({ ...base, mode: 'rewrite' });
    expect(prompt).toContain('at most 280 characters');
    expect(prompt).toContain('in the brand voice');
  });

  it('keeps the author voice when the brand has none', () => {
    const prompt = buildTextActionPrompt({
      ...base,
      hasBrandVoice: false,
      mode: 'rewrite',
    });
    expect(prompt).not.toContain('brand voice');
    expect(prompt).toContain("author's own voice");
  });
});
