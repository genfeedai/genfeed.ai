import type { BrandContextContribution } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import {
  buildBrandRequiredContextReport,
  formatBrandRequiredContextOverflow,
} from '@api/services/harness/brand-required-context-report.util';
import { describe, expect, it } from 'vitest';

function section(header: string, value: unknown): BrandContextContribution {
  return {
    content: JSON.stringify(value),
    header,
    isAtomic: true,
    untrusted: false,
  };
}

describe('buildBrandRequiredContextReport', () => {
  const required = [
    section('## Brand Identity', { name: 'Acme', description: 'd'.repeat(50) }),
    section('## Approved Brand Voice', {
      audience: ['founders'],
      guidelines: 'g'.repeat(6200),
      tone: 'warm and direct',
    }),
    section('## Required Brand Mandatory Rules', [{ id: 'r1' }]),
  ];

  it('names the Brand Kit field behind each key, longest first', () => {
    const report = buildBrandRequiredContextReport(required, 7584, 6000);
    expect(report.fields.map((entry) => entry.field)).toEqual([
      'promptGuidelines',
      'description',
      'voiceTone',
      '## Required Brand Mandatory Rules',
      'voiceAudience',
      'label',
    ]);
    expect(report.fields[0]).toEqual({
      characters: 6202,
      field: 'promptGuidelines',
    });
  });

  it('reports the overflow in characters, never below zero', () => {
    expect(buildBrandRequiredContextReport(required, 7584, 6000)).toMatchObject(
      { overflowCharacters: 1584 },
    );
    expect(buildBrandRequiredContextReport(required, 100, 6000)).toMatchObject({
      overflowCharacters: 0,
    });
  });
});

describe('formatBrandRequiredContextOverflow', () => {
  it('states the numbers and the three longest fields', () => {
    const report = buildBrandRequiredContextReport(
      [
        section('## Approved Brand Voice', {
          avoid: ['a'.repeat(300)],
          guidelines: 'g'.repeat(6200),
          sample: 's'.repeat(900),
          style: 'y'.repeat(100),
        }),
      ],
      7584,
      6000,
    );
    expect(formatBrandRequiredContextOverflow(report)).toBe(
      'The Brand Kit text a generation must carry is 7,584 characters and the limit is 6,000, so it is 1,584 too long. Shorten the longest fields: promptGuidelines (6,202 characters), voiceSampleOutput (902 characters), voiceDoNotSoundLike (304 characters).',
    );
  });
});
