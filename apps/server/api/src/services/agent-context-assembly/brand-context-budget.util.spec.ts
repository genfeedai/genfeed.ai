import {
  BRAND_CONTEXT_CHARACTER_BUDGET,
  fitBrandContextToBudget,
  fitBrandContextToBudgetWithReport,
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
    `## Retrieved Brand Memory\n- ${'r'.repeat(120)}`,
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
    const withoutRag = removeSection(prompt, '## Retrieved Brand Memory');
    const result = fitBrandContextToBudget([prompt], withoutRag.length);

    expect(result).not.toContain('## Retrieved Brand Memory');
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

    expect(result).not.toContain('## Retrieved Brand Memory');
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

  it('reduces Brand Knowledge after retrieval, recency and history but before general context', () => {
    const contributions = [
      `## Brand: Acme\n${'a'.repeat(60)}`,
      `## Brand Knowledge\n- ${'k'.repeat(120)}`,
      `## Retrieved Brand Memory\n- ${'r'.repeat(120)}`,
      `## Recent Posts (avoid repetition)\n- ${'p'.repeat(120)}`,
    ];
    const full = fitBrandContextToBudget(contributions);
    // Retrieval (148) and recent posts (157) must go entirely; Knowledge
    // (141) absorbs the remaining overflow while identity (75) stays whole.
    const budget = 150;

    const result = fitBrandContextToBudgetWithReport(contributions, budget);
    const byHeader = new Map(
      result.sections.map((section) => [section.header, section]),
    );

    expect(result.isTrimmed).toBe(true);
    expect(result.maxLength).toBe(budget);
    expect(result.untrimmedLength).toBe(full.length);
    expect(result.text.length).toBeLessThanOrEqual(budget);
    expect(byHeader.get('## Retrieved Brand Memory')?.status).toBe('dropped');
    expect(byHeader.get('## Recent Posts (avoid repetition)')?.status).toBe(
      'dropped',
    );
    expect(byHeader.get('## Brand Knowledge')).toMatchObject({
      priority: 'brandKnowledge',
      status: 'trimmed',
    });
    expect(byHeader.get('## Brand: Acme')).toMatchObject({
      priority: 'general',
      status: 'kept',
    });
  });

  it('reports every section as kept when the context fits', () => {
    const result = fitBrandContextToBudgetWithReport([
      `## Brand Voice\n- ${'v'.repeat(20)}`,
    ]);

    expect(result.isTrimmed).toBe(false);
    expect(result.sections).toEqual([
      {
        header: '## Brand Voice',
        originalLength: 37,
        priority: 'brandVoice',
        renderedLength: 37,
        status: 'kept',
      },
    ]);
  });

  it('reports an unbounded budget as null', () => {
    const result = fitBrandContextToBudgetWithReport(
      ['## Brand: Acme'],
      Number.POSITIVE_INFINITY,
    );

    expect(result.maxLength).toBeNull();
    expect(result.text).toBe('## Brand: Acme');
  });
});
