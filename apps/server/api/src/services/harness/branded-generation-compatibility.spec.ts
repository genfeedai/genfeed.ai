import { deriveBrandLearningCompatibility } from '@api/services/harness/branded-generation-compatibility';
import { ContentLearningArm } from '@genfeedai/contracts/enums';
import type {
  BrandIdentitySnapshotV1,
  LearningFormat,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const hash = `sha256:${'a'.repeat(64)}`;
function snapshot(): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-01T00:00:00.000Z',
    contentHash: hash,
    identity: {
      name: 'Historical A',
      description: 'Description',
      positioning: 'Position',
      language: 'en',
    },
    voice: {
      tone: 'Direct',
      style: 'Plain',
      audience: ['Founders'],
      values: ['Clarity'],
      messagingPillars: ['Useful'],
      avoid: [],
      sample: 'Sample',
    },
    generationRules: {
      schemaVersion: 1,
      evidence: [
        {
          id: 'e',
          sourceType: 'manual',
          label: 'Owner',
          sourceId: 'source',
          sourceVersion: 2,
          contentHash: hash,
        },
      ],
      facts: [],
      mandatory: [],
      avoid: [],
      palette: [],
      typography: [],
      assets: [],
      examples: [],
    },
    diagnostics: [],
  };
}
function fact(
  required = true,
  match: 'literal' | 'semantic' = 'literal',
): BrandIdentitySnapshotV1['generationRules']['facts'][number] {
  return {
    id: 'fact',
    kind: 'statement',
    subject: 'Product',
    predicate: 'name',
    value: 'Acme',
    evidenceIds: ['e'],
    required,
    match,
  };
}

const arms = [
  ContentLearningArm.QUESTION_EXAMPLE,
  ContentLearningArm.PROOF_STEPS,
];
function example(input: BrandIdentitySnapshotV1): void {
  input.generationRules.examples = [
    {
      id: 'example',
      polarity: 'positive',
      text: 'Example',
      evidenceIds: ['e'],
    },
  ];
}
describe('deriveBrandLearningCompatibility', () => {
  it.each([
    {
      example: false,
      proof: false,
      excluded: arms,
      reasons: [
        'learning.missing_approved_example',
        'learning.missing_fact_evidence',
      ],
    },
    {
      example: true,
      proof: false,
      excluded: [arms[1]],
      reasons: ['learning.missing_fact_evidence'],
    },
    {
      example: false,
      proof: true,
      excluded: [arms[0]],
      reasons: ['learning.missing_approved_example'],
    },
    { example: true, proof: true, excluded: [], reasons: [] },
  ])('derives exact eligibility for $example example / $proof proof', (row) => {
    const input = snapshot();
    if (row.example) example(input);
    if (row.proof) input.generationRules.facts = [fact()];
    input.diagnostics = [
      {
        code: 'existing',
        severity: 'info',
        message: 'Existing snapshot diagnostic',
      },
    ];
    const before = structuredClone(input);
    const [mask, diagnostics] = deriveBrandLearningCompatibility(input, 'text');
    expect(mask).toEqual({
      snapshotHash: hash,
      compatible: row.excluded.length < 2,
      excludedArmIds: row.excluded,
    });
    expect(diagnostics.map((entry) => entry.code)).toEqual(row.reasons);
    expect(
      diagnostics.every(
        (entry) =>
          Object.keys(entry).sort().join() === 'code,message,severity' &&
          entry.severity === 'warning',
      ),
    ).toBe(true);
    expect(mask.excludedArmIds).not.toContain(ContentLearningArm.BASELINE);
    expect(input).toEqual(before);
  });
  it.each<LearningFormat>(['image', 'carousel', 'video', 'short'])(
    'vetoes %s before required rule reasons',
    (format) => {
      const input = snapshot();
      example(input);
      input.generationRules.facts = [fact(true, 'semantic')];
      const [mask, diagnostics] = deriveBrandLearningCompatibility(
        input,
        format,
      );
      expect(mask.excludedArmIds).toEqual(arms);
      expect(mask.compatible).toBe(false);
      expect(diagnostics.map((entry) => entry.code)).toEqual([
        'learning.compatibility_unverified_media',
      ]);
    },
  );
  it.each([
    'semantic fact',
    'literal mandatory',
    'semantic mandatory',
    'literal avoid',
    'semantic avoid',
    'voice avoid',
  ])('conservatively vetoes %s', (kind) => {
    const input = snapshot();
    example(input);
    input.generationRules.facts = [fact()];
    if (kind === 'semantic fact')
      input.generationRules.facts[0].match = 'semantic';
    else if (kind === 'voice avoid') input.voice.avoid = ['Avoid'];
    else
      input.generationRules[
        kind.includes('mandatory') ? 'mandatory' : 'avoid'
      ] = [
        {
          id: 'rule',
          text: 'Constraint',
          required: true,
          match: kind.startsWith('literal') ? 'literal' : 'semantic',
          evidenceIds: ['e'],
        },
      ];
    const [mask, diagnostics] = deriveBrandLearningCompatibility(
      input,
      'thread',
    );
    expect(mask).toEqual({
      snapshotHash: hash,
      compatible: false,
      excludedArmIds: arms,
    });
    expect(diagnostics.map((entry) => entry.code)).toEqual([
      'learning.compatibility_unverified',
    ]);
  });
  it('does not veto nonrequired semantic rules or declare visual validation', () => {
    const input = snapshot();
    example(input);
    input.generationRules.facts = [
      fact(false),
      { ...fact(false, 'semantic'), id: 'soft' },
    ];
    input.generationRules.mandatory = [
      {
        id: 'soft-text',
        text: 'Soft',
        required: false,
        match: 'semantic',
        evidenceIds: ['e'],
      },
    ];
    input.generationRules.palette = [
      {
        id: 'palette',
        color: '#AABBCC',
        usage: 'Background',
        required: true,
        evidenceIds: ['e'],
      },
    ];
    expect(deriveBrandLearningCompatibility(input, 'thread')).toEqual([
      { snapshotHash: hash, compatible: true, excludedArmIds: [] },
      [],
    ]);
  });
  it('requires referenced literal-fact proof and keeps manual evidence labelled manual', () => {
    const input = snapshot();
    example(input);
    input.generationRules.facts = [fact(false)];
    input.generationRules.evidence[0].sourceType = 'website';
    input.generationRules.evidence.push({
      id: 'unreferenced',
      sourceType: 'manual',
      label: 'Unreferenced',
    });
    expect(
      deriveBrandLearningCompatibility(input, 'text')[0].excludedArmIds,
    ).toEqual([arms[1]]);
    input.generationRules.evidence[0].excerpt = 'Evidence excerpt';
    expect(
      deriveBrandLearningCompatibility(input, 'text')[0].excludedArmIds,
    ).toEqual([]);
    input.generationRules.facts[0].match = 'semantic';
    expect(
      deriveBrandLearningCompatibility(input, 'text')[0].excludedArmIds,
    ).toEqual([arms[1]]);
  });
  it('rejects missing evidence and negative examples do not enable question/example', () => {
    const input = snapshot();
    input.generationRules.examples = [
      { id: 'negative', polarity: 'negative', text: 'Bad', evidenceIds: ['e'] },
    ];
    expect(
      deriveBrandLearningCompatibility(input, 'text')[0].excludedArmIds,
    ).toEqual(arms);
    input.generationRules.examples[0].evidenceIds = ['absent'];
    expect(() => deriveBrandLearningCompatibility(input, 'text')).toThrow(
      'Unresolved evidence',
    );
  });
});
