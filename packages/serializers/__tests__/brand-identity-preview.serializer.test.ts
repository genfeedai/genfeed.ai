import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { BrandIdentityPreviewSerializer } from '@serializers/server/content/brand-identity-preview.serializer';
import { describe, expect, it } from 'vitest';

const hash = `sha256:${'a'.repeat(64)}`;
function snapshot(): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'A',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-02T00:00:00.000Z',
    contentHash: hash,
    identity: { name: '  Café 東京  ' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [
        {
          id: 'e',
          sourceType: 'manual',
          label: 'Reviewed',
          excerpt: 'Exact\n東京',
        },
      ],
      facts: [],
      palette: [],
      typography: [
        {
          id: 'type',
          role: 'heading',
          family: 'Recorded only',
          weight: 400,
          style: 'normal',
          availability: 'unavailable',
          required: true,
          evidenceIds: ['e'],
        },
      ],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [],
      approvedLiterals: [
        {
          id: 'literal:copy',
          kind: 'approved_copy',
          text: ' Exact\n東京 ',
          evidenceIds: ['e'],
        },
      ],
    },
    diagnostics: [],
  };
}
function preview() {
  return {
    id: hash,
    snapshot: snapshot(),
    source: 'current_approved_revision',
  };
}
describe('strict public identity preview serializer', () => {
  it.each(['current_approved_revision', 'receipt_snapshot'])(
    'emits only the canonical snapshot and %s with hash resource identity and exact saved text',
    (source) => {
      const value = { ...preview(), source };
      const before = structuredClone(value);
      const resource = BrandIdentityPreviewSerializer.serialize(value).data;
      if (!resource || Array.isArray(resource) || !resource.attributes)
        throw new Error('Expected a single preview resource');
      expect(resource.type).toBe('brand-identity-preview');
      expect(resource.id).toBe(hash);
      expect(Object.keys(resource.attributes).sort()).toEqual([
        'snapshot',
        'source',
      ]);
      expect(resource.attributes).toEqual({
        snapshot: value.snapshot,
        source,
      });
      expect(value).toEqual(before);
      expect(resource.attributes.snapshot).toMatchObject({
        generationRules: { typography: [{ availability: 'unavailable' }] },
      });
      for (const key of [
        'actorId',
        'storageKey',
        'ciphertext',
        'approvalTokenHash',
        'prompt',
        'compliance',
        'eligible',
      ])
        expect(resource.attributes).not.toHaveProperty(key);
    },
  );
  it.each([
    { source: 'approved' },
    { id: `sha256:${'b'.repeat(64)}` },
    { snapshot: null },
    { actorId: 'PRIVATE' },
    { storageKey: 'PRIVATE' },
    { ciphertext: 'PRIVATE' },
    { prompt: 'PRIVATE' },
    { approvalTokenHash: 'PRIVATE' },
  ])('rejects malformed/mismatched/disclosing source payload %j', (patch) => {
    expect(() =>
      BrandIdentityPreviewSerializer.serialize({ ...preview(), ...patch }),
    ).toThrow();
  });
  it('rejects hidden private payloads and invented eligibility within the canonical snapshot', () => {
    for (const key of [
      'actorId',
      'ciphertext',
      'prompt',
      'eligible',
      'compliance',
    ])
      expect(() =>
        BrandIdentityPreviewSerializer.serialize({
          ...preview(),
          snapshot: { ...snapshot(), [key]: 'PRIVATE' },
        }),
      ).toThrow();
  });
  it('preserves provisional historical snapshots unchanged and validates every collection entry without filtering', () => {
    const historical = {
      ...preview(),
      source: 'receipt_snapshot',
      snapshot: { ...snapshot(), approval: 'provisional' },
    };
    const output = BrandIdentityPreviewSerializer.serialize([
      preview(),
      historical,
    ]);
    if (!Array.isArray(output.data))
      throw new Error('Expected preview collection');
    expect(output.data[1].attributes?.snapshot).toEqual(historical.snapshot);
    expect(() =>
      BrandIdentityPreviewSerializer.serialize([
        preview(),
        { ...preview(), source: 'forged' },
      ]),
    ).toThrow();
    expect(() =>
      BrandIdentityPreviewSerializer.serialize([preview(), null]),
    ).toThrow();
    expect(BrandIdentityPreviewSerializer.serialize(null)).toEqual({
      data: null,
    });
  });
});
