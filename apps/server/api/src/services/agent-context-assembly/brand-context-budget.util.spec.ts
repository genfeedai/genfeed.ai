import {
  BRAND_CONTEXT_CHARACTER_BUDGET,
  fitBrandContextToBudget,
} from '@api/services/agent-context-assembly/brand-context-budget.util';
import { describe, expect, it } from 'vitest';

function removeSection(prompt: string, heading: string): string {
  const sectionStart = prompt.indexOf(heading);
  const nextSectionStart = prompt.indexOf('\n\n', sectionStart);
  const sectionEnd = nextSectionStart === -1 ? prompt.length : nextSectionStart;
  return prompt.slice(0, sectionStart) + prompt.slice(sectionEnd + 2);
}

describe('fitBrandContextToBudget', () => {
  const prompt = fitBrandContextToBudget([
    `## Relevant Knowledge\n- ${'r'.repeat(120)}`,
    `## Recent Posts (avoid repetition)\n- ${'p'.repeat(120)}`,
    `## Historical Performance Context\n- ${'h'.repeat(120)}`,
    `## Visual Identity\n- ${'i'.repeat(120)}`,
    `## Custom Instructions\n${'c'.repeat(120)}`,
    `GUARDRAILS:\n- ${'g'.repeat(120)}`,
    `## Brand Voice\n- ${'v'.repeat(120)}`,
  ]);

  it('uses one documented default budget', () => {
    expect(BRAND_CONTEXT_CHARACTER_BUDGET).toBe(6000);
  });

  it('truncates retrieval, recency, and history before protected guidance', () => {
    const withoutRag = removeSection(prompt, '## Relevant Knowledge');
    const result = fitBrandContextToBudget([prompt], withoutRag.length);

    expect(result).not.toContain('## Relevant Knowledge');
    expect(result).toContain('## Recent Posts (avoid repetition)');
    expect(result).toContain('## Historical Performance Context');
    expect(result).toContain('## Custom Instructions');
    expect(result).toContain('GUARDRAILS:');
    expect(result).toContain('## Brand Voice');
    expect(result.length).toBeLessThanOrEqual(withoutRag.length);
  });

  it('truncates custom instructions only after general context is exhausted', () => {
    const protectedOnly = [
      `## Custom Instructions\n${'c'.repeat(120)}`,
      `GUARDRAILS:\n- ${'g'.repeat(120)}`,
      `## Brand Voice\n- ${'v'.repeat(120)}`,
    ].join('\n\n');
    const result = fitBrandContextToBudget([prompt], protectedOnly.length);

    expect(result).not.toContain('## Relevant Knowledge');
    expect(result).not.toContain('## Recent Posts (avoid repetition)');
    expect(result).not.toContain('## Historical Performance Context');
    expect(result).not.toContain('## Visual Identity');
    expect(result).toContain('## Custom Instructions');
    expect(result).toContain('GUARDRAILS:');
    expect(result).toContain('## Brand Voice');
    expect(result.length).toBeLessThanOrEqual(protectedOnly.length);
  });

  it('preserves brand voice after custom instructions and guardrails', () => {
    const voiceOnly = `## Brand Voice\n- ${'v'.repeat(120)}`;
    const result = fitBrandContextToBudget([prompt], voiceOnly.length);

    expect(result).toBe(voiceOnly);
  });
});
