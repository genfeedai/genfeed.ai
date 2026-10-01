import { readFile } from 'node:fs/promises';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { hashBrandArtifactBytes } from '@api/services/brand-validation/brand-validation-artifact.util';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type {
  BrandArtifactValidationInputV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { describe, expect, it } from 'vitest';

const service = new BrandValidationService();
const fixture = (file: string) =>
  readFile(new URL(`./fixtures/${file}`, import.meta.url));
function snapshot(): BrandIdentitySnapshotV1 {
  const value: BrandIdentitySnapshotV1 = {
    schemaVersion: 1,
    organizationId: 'fixture-org',
    brandId: 'fixture-brand-a',
    revisionId: 'fixture-revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-01T00:00:00Z',
    contentHash: `sha256:${'0'.repeat(64)}`,
    identity: { name: 'Example Co' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [
        {
          id: 'fixture-source',
          sourceType: 'manual',
          label: 'Original synthetic fixture',
        },
      ],
      facts: [
        {
          id: 'price',
          kind: 'price',
          subject: 'Example Co plan',
          predicate: 'costs',
          value: 29,
          unit: 'USD',
          match: 'literal',
          required: true,
          evidenceIds: ['fixture-source'],
        },
      ],
      palette: [],
      typography: [],
      mandatory: [
        {
          id: 'name',
          text: 'Example Co',
          match: 'literal',
          required: true,
          evidenceIds: ['fixture-source'],
        },
      ],
      avoid: [
        {
          id: 'returns',
          text: 'Guaranteed returns',
          match: 'literal',
          required: true,
          evidenceIds: ['fixture-source'],
        },
      ],
      examples: [],
      assets: [],
    },
    diagnostics: [],
  };
  value.contentHash = hashBrandIdentitySnapshotV1(value);
  return value;
}
function artifactInput(
  textBytes: Uint8Array | null,
  parts: BrandArtifactValidationInputV1['material']['parts'],
  descriptors: BrandArtifactValidationInputV1['artifact']['parts'],
  mediaKind: BrandArtifactValidationInputV1['artifact']['mediaKind'],
): BrandArtifactValidationInputV1 {
  return {
    snapshot: snapshot(),
    artifact: {
      kind: 'visual_export',
      id: 'fixture-output',
      version: 'fixture-v1',
      mediaKind,
      parts: descriptors,
      contentHash: hashBrandedGenerationArtifactManifestV1({
        mediaKind,
        textHash: textBytes === null ? null : hashBrandArtifactBytes(textBytes),
        parts: descriptors,
      }),
    },
    material: {
      artifactKind: 'visual_export',
      artifactId: 'fixture-output',
      artifactVersion: 'fixture-v1',
      textBytes,
      parts,
      references: [],
    },
  };
}

describe('genuine immutable synthetic corpus through the conservative core', () => {
  it.each([
    'literal-baseline',
    'fabricated-price',
    'changed-period',
    'fabricated-testimonial',
    'fabricated-metric',
    'extra-prose',
    'missing-mandatory',
    'unicode-crlf',
  ])('validates actual UTF-8 for %s without factual PASS', async (id) => {
    const corpus: unknown = JSON.parse(
      (await fixture('approved-text.json')).toString('utf8'),
    );
    if (
      !corpus ||
      typeof corpus !== 'object' ||
      !Object.hasOwn(corpus, 'cases') ||
      !('cases' in corpus) ||
      !Array.isArray(corpus.cases)
    ) {
      throw new Error('Invalid synthetic text fixture container');
    }
    const row: unknown =
      corpus.cases[
        [
          'literal-baseline',
          'fabricated-price',
          'changed-period',
          'fabricated-testimonial',
          'fabricated-metric',
          'extra-prose',
          'missing-mandatory',
          'unicode-crlf',
        ].indexOf(id)
      ];
    expect(row).toBeDefined();
    if (
      !row ||
      typeof row !== 'object' ||
      !Object.hasOwn(row, 'id') ||
      !('id' in row) ||
      row.id !== id ||
      !Object.hasOwn(row, 'text') ||
      !('text' in row) ||
      typeof row.text !== 'string' ||
      !Object.hasOwn(row, 'expectedMandatoryPresent') ||
      !('expectedMandatoryPresent' in row) ||
      typeof row.expectedMandatoryPresent !== 'boolean' ||
      !Object.hasOwn(row, 'expectedForbiddenPresent') ||
      !('expectedForbiddenPresent' in row) ||
      typeof row.expectedForbiddenPresent !== 'boolean'
    ) {
      throw new Error('Invalid or reordered synthetic text fixture case');
    }
    const bytes = Buffer.from(row.text, 'utf8');
    const value = artifactInput(bytes, [], [], 'text');
    const report = await service.validateBrandArtifact(value);
    expect(report.checks.find((check) => check.ruleId === 'name')?.result).toBe(
      row.expectedMandatoryPresent ? 'pass' : 'fail',
    );
    expect(
      report.checks.find((check) => check.ruleId === 'returns')?.result,
    ).toBe(row.expectedForbiddenPresent ? 'fail' : 'pass');
    expect(
      report.checks
        .filter((check) => check.category === 'fact')
        .map((check) => check.result),
    ).toEqual(['unknown', 'unknown']);
    expect(report.artifactHash).toBe(value.artifact.contentHash);
    expect(report.quality).toBeNull();
  });
  it('normalizes only matching while retaining BOM/CRLF/Unicode byte identity', async () => {
    const text = '\ufeffExample Co\r\nCafe\u0301.\0';
    const bytes = Buffer.from(text);
    const value = artifactInput(bytes, [], [], 'text');
    value.snapshot.generationRules.mandatory.push({
      id: 'accent',
      text: 'Co\nCafé',
      match: 'literal',
      required: true,
      evidenceIds: ['fixture-source'],
    });
    value.snapshot.contentHash = hashBrandIdentitySnapshotV1(value.snapshot);
    expect(
      (await service.validateBrandArtifact(value)).checks.find(
        (check) => check.ruleId === 'accent',
      )?.result,
    ).toBe('pass');
    expect(hashBrandArtifactBytes(bytes)).not.toBe(
      hashBrandArtifactBytes(
        Buffer.from(text.replaceAll('\r\n', '\n').normalize('NFC')),
      ),
    );
    value.snapshot.generationRules.mandatory[0].text = 'example co';
    value.snapshot.contentHash = hashBrandIdentitySnapshotV1(value.snapshot);
    expect(
      (await service.validateBrandArtifact(value)).checks.find(
        (check) => check.ruleId === 'name',
      )?.result,
    ).toBe('fail');
  });
  it.each([
    'approved.png',
    'wrong-palette.png',
    'wrong-logo.png',
    'logo.png',
    'product.png',
    'sample.mp4',
  ])('binds real %s bytes without visual/video PASS', async (file) => {
    const bytes = await fixture(file);
    const before = Buffer.from(bytes);
    const video = file.endsWith('.mp4');
    const descriptor: BrandArtifactValidationInputV1['artifact']['parts'][number] =
      {
        id: 'primary',
        version: 'v1',
        role: video ? 'video' : 'image',
        contentHash: hashBrandArtifactBytes(bytes),
      };
    const value = artifactInput(
      null,
      [{ partId: 'primary', partVersion: 'v1', bytes }],
      [descriptor],
      video ? 'video' : 'image',
    );
    value.snapshot.generationRules.palette.push({
      id: 'palette',
      color: '#123456',
      usage: 'background',
      required: true,
      evidenceIds: ['fixture-source'],
    });
    value.snapshot.contentHash = hashBrandIdentitySnapshotV1(value.snapshot);
    const report = await service.validateBrandArtifact(value);
    expect(
      report.checks.find((check) => check.ruleId === 'palette')?.result,
    ).toBe('unsupported');
    expect(report.checks.some((check) => check.result === 'pass')).toBe(false);
    expect(report.checks.at(-1)?.result).toBe('unknown');
    expect(bytes).toEqual(before);
  });
  it('rejects a changed part with old digest, accepts consistent negative identity conservatively', async () => {
    const approved = await fixture('approved.png');
    const negative = await fixture('wrong-palette.png');
    const descriptor: BrandArtifactValidationInputV1['artifact']['parts'][number] =
      {
        id: 'image',
        version: 'v1',
        role: 'primary',
        contentHash: hashBrandArtifactBytes(approved),
      };
    const value = artifactInput(
      null,
      [{ partId: 'image', partVersion: 'v1', bytes: negative }],
      [descriptor],
      'image',
    );
    await expect(service.validateBrandArtifact(value)).rejects.toThrowError(
      'brand_validation_artifact_hash_mismatch',
    );
    descriptor.contentHash = hashBrandArtifactBytes(negative);
    value.artifact.contentHash = hashBrandedGenerationArtifactManifestV1({
      mediaKind: 'image',
      textHash: null,
      parts: [descriptor],
    });
    expect(
      (await service.validateBrandArtifact(value)).checks.some(
        (check) => check.result === 'pass',
      ),
    ).toBe(false);
  });
  it('correct approved references never prove placement and snapshot A/B remain separately bound', async () => {
    const logo = await fixture('logo.png');
    const product = await fixture('product.png');
    const value = artifactInput(Buffer.from('Example Co'), [], [], 'text');
    value.snapshot.generationRules.assets = [
      {
        id: 'logo',
        assetId: 'logo-asset',
        role: 'logo',
        contentHash: hashBrandArtifactBytes(logo),
        required: true,
        evidenceIds: ['fixture-source'],
      },
      {
        id: 'product',
        assetId: 'product-asset',
        role: 'product',
        contentHash: hashBrandArtifactBytes(product),
        required: true,
        evidenceIds: ['fixture-source'],
      },
      {
        id: 'font',
        assetId: 'synthetic-font-reference',
        role: 'font',
        contentHash: hashBrandArtifactBytes(logo),
        required: true,
        evidenceIds: ['fixture-source'],
      },
    ];
    value.material.references = [
      { assetReferenceId: 'logo', assetId: 'logo-asset', bytes: logo },
      { assetReferenceId: 'product', assetId: 'product-asset', bytes: product },
      {
        assetReferenceId: 'font',
        assetId: 'synthetic-font-reference',
        bytes: logo,
      },
    ];
    value.snapshot.contentHash = hashBrandIdentitySnapshotV1(value.snapshot);
    const a = await service.validateBrandArtifact(value);
    expect(
      a.checks
        .filter((check) => ['logo', 'product', 'font'].includes(check.ruleId))
        .every((check) => check.result === 'unsupported'),
    ).toBe(true);
    value.snapshot.revisionId = 'fixture-revision-b';
    value.snapshot.revisionVersion = 2;
    value.snapshot.identity.name = 'Example B';
    value.snapshot.contentHash = hashBrandIdentitySnapshotV1(value.snapshot);
    const b = await service.validateBrandArtifact(value);
    expect(a.snapshotHash).not.toBe(b.snapshotHash);
    expect(a.artifactHash).toBe(b.artifactHash);
    expect(a.checks.at(-1)?.result).toBe('unknown');
    expect(b.checks.at(-1)?.result).toBe('unknown');
  });
});
