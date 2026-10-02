import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { hashBrandArtifactBytes } from '@api/services/brand-validation/brand-validation-artifact.util';
import {
  assertBrandValidationMetadata,
  copyBrandValidationMaterial,
} from '@api/services/brand-validation/brand-validation-material.util';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { brandArtifactValidationReportV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationInputV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

const service = new BrandValidationService();
const zeroHash = `sha256:${'0'.repeat(64)}`;
function snapshot(): BrandIdentitySnapshotV1 {
  const value: BrandIdentitySnapshotV1 = {
    schemaVersion: 1,
    organizationId: 'org-a',
    brandId: 'brand-a',
    revisionId: 'revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-01T00:00:00Z',
    contentHash: zeroHash,
    identity: { name: 'Example Co' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [
        { id: 'evidence-a', sourceType: 'manual', label: 'Synthetic source' },
      ],
      facts: [],
      palette: [],
      typography: [],
      mandatory: [
        {
          id: 'mandatory-a',
          text: 'Example Co',
          match: 'literal',
          required: true,
          evidenceIds: ['evidence-a'],
        },
      ],
      avoid: [
        {
          id: 'avoid-a',
          text: 'Guaranteed returns',
          match: 'literal',
          required: true,
          evidenceIds: ['evidence-a'],
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
function input(
  text = 'Example Co offers a plan.',
): BrandArtifactValidationInputV1 {
  const textBytes = Buffer.from(text);
  return {
    snapshot: snapshot(),
    artifact: {
      kind: 'post',
      id: 'output-a',
      version: 'v1',
      mediaKind: 'text',
      parts: [],
      contentHash: hashBrandedGenerationArtifactManifestV1({
        mediaKind: 'text',
        textHash: hashBrandArtifactBytes(textBytes),
        parts: [],
      }),
    },
    material: {
      artifactKind: 'post',
      artifactId: 'output-a',
      artifactVersion: 'v1',
      textBytes,
      parts: [],
      references: [],
    },
  };
}
function refresh(value: BrandArtifactValidationInputV1): void {
  value.snapshot.contentHash = hashBrandIdentitySnapshotV1(value.snapshot);
  value.artifact.contentHash = hashBrandedGenerationArtifactManifestV1({
    mediaKind: value.artifact.mediaKind,
    textHash:
      value.material.textBytes === null
        ? null
        : hashBrandArtifactBytes(value.material.textBytes),
    parts: value.artifact.parts,
  });
}
function addPart(
  value: BrandArtifactValidationInputV1,
  id = 'part-a',
  role: BrandArtifactValidationInputV1['artifact']['parts'][number]['role'] = 'overlay',
): void {
  const bytes = Buffer.from(id);
  value.artifact.parts.push({
    id,
    version: 'part-v1',
    role,
    contentHash: hashBrandArtifactBytes(bytes),
  });
  value.material.parts = [
    ...value.material.parts,
    { partId: id, partVersion: 'part-v1', bytes },
  ];
  refresh(value);
}
async function rejected(
  value: BrandArtifactValidationInputV1,
  message = 'brand_validation_invalid_input',
): Promise<void> {
  let failure: unknown;
  try {
    await service.validateBrandArtifact(value);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(BadRequestException);
  expect(failure instanceof Error && failure.message).toBe(message);
}

describe('canonical conservative brand validation', () => {
  it('returns a schema-valid bound report, fresh UUID/date and hard factual unknown', async () => {
    const value = input();
    const report = await service.validateBrandArtifact(value);
    expect(
      brandArtifactValidationReportV1Schema.safeParse(report).success,
    ).toBe(true);
    expect(report.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isFinite(Date.parse(report.checkedAt))).toBe(true);
    expect(report.snapshotHash).toBe(value.snapshot.contentHash);
    expect(report.artifactHash).toBe(value.artifact.contentHash);
    expect(report.artifactId).toBe('output-a');
    expect(report.artifactVersion).toBe('v1');
    expect(report.quality).toBeNull();
    expect(report.checks.map((check) => check.result)).toEqual([
      'pass',
      'pass',
      'unknown',
    ]);
    expect(report.checks.at(-1)).toEqual({
      ruleId: 'system:factual_coverage',
      category: 'fact',
      severity: 'hard',
      result: 'unknown',
      method: 'capability',
      evidenceIds: [],
      reasonCode: 'factual_coverage_unverified',
    });
    expect((await service.validateBrandArtifact(value)).id).not.toBe(report.id);
  });
  it.each(['kind', 'id', 'version'] as const)(
    'rejects stale material %s',
    async (key) => {
      const value = input();
      if (key === 'kind') value.material.artifactKind = 'article';
      else if (key === 'id') value.material.artifactId = 'other';
      else value.material.artifactVersion = 'v2';
      await rejected(value);
    },
  );
  it('rejects snapshot, part-byte and aggregate raw-hash disagreement distinctly', async () => {
    const badSnapshot = input();
    badSnapshot.snapshot.contentHash = zeroHash;
    await rejected(badSnapshot, 'brand_validation_snapshot_hash_mismatch');
    const bytes = input();
    addPart(bytes);
    bytes.material.parts[0].bytes[0] ^= 1;
    await rejected(bytes, 'brand_validation_artifact_hash_mismatch');
    const aggregate = input();
    aggregate.artifact.contentHash = hashBrandArtifactBytes(
      aggregate.material.textBytes ?? Buffer.from('x'),
    );
    await rejected(aggregate, 'brand_validation_artifact_hash_mismatch');
  });
  it.each(['missing', 'extra', 'duplicate', 'stale'] as const)(
    'rejects %s loaded part identity',
    async (mutation) => {
      const value = input();
      addPart(value);
      const part = value.material.parts[0];
      if (mutation === 'missing') value.material.parts = [];
      else if (mutation === 'extra')
        value.material.parts = [
          ...value.material.parts,
          { ...part, partId: 'extra' },
        ];
      else if (mutation === 'duplicate') value.material.parts = [part, part];
      else value.material.parts = [{ ...part, partVersion: 'v2' }];
      await rejected(value);
    },
  );
  it('binds all reordered parts and keeps multipart literal coverage unknown', async () => {
    const value = input();
    addPart(value, 'first');
    addPart(value, 'second', 'audio');
    value.material.parts = [...value.material.parts].reverse();
    const report = await service.validateBrandArtifact(value);
    expect(report.checks.slice(0, 2).map((check) => check.reasonCode)).toEqual([
      'text_coverage_incomplete',
      'text_coverage_incomplete',
    ]);
    value.material.parts[0].bytes[0] ^= 1;
    await rejected(value, 'brand_validation_artifact_hash_mismatch');
  });
  it.each(['unknown', 'duplicate', 'assetId', 'missingHash', 'bytes'] as const)(
    'rejects %s approved reference mismatch',
    async (mutation) => {
      const value = input();
      const bytes = Buffer.from('logo');
      value.snapshot.generationRules.assets.push({
        id: 'logo-ref',
        assetId: 'asset-a',
        role: 'logo',
        required: true,
        evidenceIds: ['evidence-a'],
        contentHash: hashBrandArtifactBytes(bytes),
      });
      value.material.references = [
        { assetReferenceId: 'logo-ref', assetId: 'asset-a', bytes },
      ];
      if (mutation === 'unknown')
        value.material.references = [
          { assetReferenceId: 'unknown', assetId: 'asset-a', bytes },
        ];
      else if (mutation === 'duplicate')
        value.material.references = [
          ...value.material.references,
          ...value.material.references,
        ];
      else if (mutation === 'assetId')
        value.material.references = [
          { assetReferenceId: 'logo-ref', assetId: 'wrong', bytes },
        ];
      else if (mutation === 'missingHash')
        delete value.snapshot.generationRules.assets[0].contentHash;
      else bytes[0] ^= 1;
      refresh(value);
      await rejected(value, 'brand_validation_reference_mismatch');
    },
  );
  it('retains unsupported asset checks for absent or correct references', async () => {
    const value = input();
    value.snapshot.generationRules.assets.push({
      id: 'logo-ref',
      assetId: 'asset-a',
      role: 'logo',
      required: true,
      evidenceIds: ['evidence-a'],
      contentHash: hashBrandArtifactBytes(Buffer.from('logo')),
    });
    refresh(value);
    expect(
      (await service.validateBrandArtifact(value)).checks.find(
        (check) => check.ruleId === 'logo-ref',
      )?.result,
    ).toBe('unsupported');
    value.material.references = [
      {
        assetReferenceId: 'logo-ref',
        assetId: 'asset-a',
        bytes: Buffer.from('logo'),
      },
    ];
    expect(
      (await service.validateBrandArtifact(value)).checks.find(
        (check) => check.ruleId === 'logo-ref',
      )?.result,
    ).toBe('unsupported');
  });
  it.each([
    'schema',
    'unknownKey',
    'accessor',
    'toJSON',
    'exotic',
    'cycle',
    'sparse',
  ] as const)(
    'rejects %s metadata without invoking getters',
    async (mutation) => {
      const value = input();
      const getter = vi.fn(() => 'unsafe');
      if (mutation === 'schema') {
        // @ts-expect-error Intentional malformed canonical schema version.
        value.snapshot.schemaVersion = 2;
      } else if (mutation === 'unknownKey')
        Object.defineProperty(value.snapshot.identity, 'extra', {
          enumerable: true,
          value: 'x',
        });
      else if (mutation === 'accessor')
        Object.defineProperty(value.snapshot.identity, 'name', {
          enumerable: true,
          get: getter,
        });
      else if (mutation === 'toJSON')
        Object.defineProperty(value.snapshot.identity, 'toJSON', {
          enumerable: true,
          value: getter,
        });
      else if (mutation === 'exotic')
        Object.setPrototypeOf(value.snapshot.identity, Date.prototype);
      else if (mutation === 'cycle')
        Object.defineProperty(value.snapshot.identity, 'cycle', {
          enumerable: true,
          value: value.snapshot,
        });
      else value.snapshot.voice.audience = new Array(1);
      await rejected(value);
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it('rejects top-level/material tuple accessors and extra keys', async () => {
    const getter = vi.fn();
    const value = input();
    Object.defineProperty(value, 'snapshot', { get: getter, enumerable: true });
    await rejected(value);
    expect(getter).not.toHaveBeenCalled();
    const material = input();
    addPart(material);
    Object.defineProperty(material.material.parts[0], 'bytes', {
      get: getter,
      enumerable: true,
    });
    await rejected(material);
    expect(getter).not.toHaveBeenCalled();
    const extra = input();
    Object.defineProperty(extra.material, 'extra', {
      value: 'x',
      enumerable: true,
    });
    await rejected(extra);
  });
  it('checks descriptor budgets and permits shared noncyclic objects', () => {
    const shared = { safe: 'value' };
    expect(() =>
      assertBrandValidationMetadata({ a: shared, b: shared }),
    ).not.toThrow();
    let deep: unknown = null;
    for (let i = 0; i < 17; i++) deep = { nested: deep };
    expect(() => assertBrandValidationMetadata(deep)).toThrow();
    expect(() =>
      assertBrandValidationMetadata(
        Object.fromEntries(
          Array.from({ length: 1025 }, (_, i) => [`key${i}`, 1]),
        ),
      ),
    ).toThrow();
    expect(() => assertBrandValidationMetadata('x'.repeat(500001))).toThrow();
    const group = Array.from({ length: 1023 }, () => 1);
    expect(() =>
      assertBrandValidationMetadata(Array.from({ length: 33 }, () => group)),
    ).toThrow();
    expect(() =>
      assertBrandValidationMetadata({ [Symbol('key')]: 1 }),
    ).toThrow();
    expect(() =>
      assertBrandValidationMetadata(
        Object.defineProperty({}, 'hidden', { value: 1 }),
      ),
    ).toThrow();
    expect(() => assertBrandValidationMetadata({ constructor: 1 })).toThrow();
  });
  it('captures ordinary subviews and remains unchanged after post-invocation mutation', async () => {
    const value = input();
    const backing = Buffer.from('!Example Co offers a plan.!');
    value.material.textBytes = backing.subarray(1, backing.length - 1);
    refresh(value);
    const original = Buffer.from(backing);
    const captured = copyBrandValidationMaterial(value.material);
    expect(backing).toEqual(original);
    const pending = service.validateBrandArtifact(value);
    backing.fill(0);
    value.snapshot.identity.name = 'mutated';
    value.artifact.version = 'v2';
    const report = await pending;
    expect(report.checks[0].result).toBe('pass');
    expect(report.artifactVersion).toBe('v1');
    expect(Buffer.from(captured.textBytes ?? []).toString()).toBe(
      'Example Co offers a plan.',
    );
  });
  it.each(['shared', 'detached', 'resizable'] as const)(
    'rejects %s backing',
    async (kind) => {
      const value = input();
      if (kind === 'shared')
        value.material.textBytes = new Uint8Array(new SharedArrayBuffer(4));
      else if (kind === 'detached') {
        const bytes = new Uint8Array(4);
        structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
        value.material.textBytes = bytes;
      } else
        value.material.textBytes = new Uint8Array(
          Reflect.construct(ArrayBuffer, [4, { maxByteLength: 8 }]),
        );
      await rejected(value);
    },
  );
  it.each([
    'empty',
    'artifactLimit',
    'referenceLimit',
    'partCount',
    'referenceCount',
    'textLimit',
    'utf8',
    'missingText',
    'noVisual',
  ] as const)('rejects %s resource/input boundary', async (kind) => {
    const value = input();
    if (kind === 'empty') value.material.textBytes = Buffer.alloc(0);
    else if (kind === 'artifactLimit')
      value.material.textBytes = Buffer.alloc(20971521);
    else if (kind === 'referenceLimit')
      value.material.references = [
        { assetReferenceId: 'x', assetId: 'x', bytes: Buffer.alloc(20971521) },
      ];
    else if (kind === 'partCount')
      value.material.parts = Array.from({ length: 9 }, (_, i) => ({
        partId: `p${i}`,
        partVersion: 'v1',
        bytes: Buffer.from('x'),
      }));
    else if (kind === 'referenceCount')
      value.material.references = Array.from({ length: 9 }, (_, i) => ({
        assetReferenceId: `a${i}`,
        assetId: 'x',
        bytes: Buffer.from('x'),
      }));
    else if (kind === 'textLimit')
      value.material.textBytes = Buffer.from('x'.repeat(100001));
    else if (kind === 'utf8') value.material.textBytes = Buffer.from([255]);
    else if (kind === 'missingText') value.material.textBytes = null;
    else value.artifact.mediaKind = 'image';
    await rejected(value);
  });
  it('handles empty legacy rules, namespace and 255-rule boundary in both methods', async () => {
    const value = input();
    value.snapshot.generationRules.mandatory = [];
    value.snapshot.generationRules.avoid = [];
    refresh(value);
    expect((await service.validateBrandArtifact(value)).checks).toHaveLength(1);
    const rules = value.snapshot.generationRules;
    rules.facts = Array.from({ length: 128 }, (_, i) => ({
      id: `fact${i}`,
      kind: 'statement',
      subject: 's',
      predicate: 'p',
      value: 'v',
      match: 'literal',
      required: false,
      evidenceIds: ['evidence-a'],
    }));
    rules.mandatory = Array.from({ length: 64 }, (_, i) => ({
      id: `must${i}`,
      text: 'Example Co',
      match: 'literal',
      required: false,
      evidenceIds: ['evidence-a'],
    }));
    rules.avoid = Array.from({ length: 63 }, (_, i) => ({
      id: `avoid${i}`,
      text: 'absent',
      match: 'literal',
      required: false,
      evidenceIds: ['evidence-a'],
    }));
    rules.examples = [
      {
        id: 'example',
        polarity: 'positive',
        text: 'x',
        evidenceIds: ['evidence-a'],
      },
    ];
    refresh(value);
    expect((await service.validateBrandArtifact(value)).checks).toHaveLength(
      256,
    );
    rules.avoid.push({
      id: 'one-too-many',
      text: 'absent',
      match: 'literal',
      required: false,
      evidenceIds: ['evidence-a'],
    });
    refresh(value);
    await rejected(value);
    expect(() =>
      service.preflightBrandCapabilities({
        snapshot: value.snapshot,
        provider: 'p',
        model: 'm',
        mediaKind: 'text',
      }),
    ).toThrowError('brand_validation_invalid_input');
    const reserved = input();
    reserved.snapshot.generationRules.mandatory[0].id = 'system:forged';
    refresh(reserved);
    await rejected(reserved);
    expect(() =>
      service.preflightBrandCapabilities({
        snapshot: reserved.snapshot,
        provider: 'p',
        model: 'm',
        mediaKind: 'text',
      }),
    ).toThrowError('brand_validation_invalid_input');
  });
  it.each(['buffer', 'byteOffset', 'byteLength', 'length'])(
    'rejects byte-view shadow %s without invoking it',
    async (key) => {
      const value = input();
      const getter = vi.fn(() => {
        throw new Error('must not execute');
      });
      Object.defineProperty(value.material.textBytes, key, { get: getter });
      await rejected(value);
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['byteLength', 'resizable', 'maxByteLength', 'detached'])(
    'rejects backing shadow %s without invoking it',
    async (key) => {
      const value = input();
      const bytes = new Uint8Array([1]);
      const getter = vi.fn(() => {
        throw new Error('must not execute');
      });
      Object.defineProperty(bytes.buffer, key, { get: getter });
      value.material.textBytes = bytes;
      await rejected(value);
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it('ignores caller coercion and iterator hooks while copying actual slots', () => {
    const bytes = new Uint8Array([97, 98, 99]);
    const hook = vi.fn(() => {
      throw new Error('must not execute');
    });
    Object.defineProperty(bytes, 'valueOf', { value: hook });
    Object.defineProperty(bytes, Symbol.iterator, { value: hook });
    Object.defineProperty(bytes, Symbol.toPrimitive, { value: hook });
    const value = input();
    value.material.textBytes = bytes;
    expect(
      Buffer.from(
        copyBrandValidationMaterial(value.material).textBytes ?? [],
      ).toString(),
    ).toBe('abc');
    expect(hook).not.toHaveBeenCalled();
  });
  it('rejects custom prototypes, subclasses, proxies and spoofed typed arrays', async () => {
    class CustomBytes extends Uint8Array {}
    const subclass = input();
    subclass.material.textBytes = new CustomBytes([1]);
    await rejected(subclass);
    const proxy = input();
    proxy.material.textBytes = new Proxy(new Uint8Array([1]), {});
    await rejected(proxy);
    const spoofed = input();
    spoofed.material.textBytes = Object.create(Uint8Array.prototype);
    await rejected(spoofed);
    const altered = input();
    const bytes = new Uint8Array([1]);
    Object.setPrototypeOf(bytes, {});
    altered.material.textBytes = bytes;
    await rejected(altered);
  });
  it('counts repeated views in every aggregate slot before allocation', () => {
    const value = input();
    const bytes = Buffer.alloc(11_000_000);
    value.material.textBytes = bytes;
    value.material.parts = [{ partId: 'p1', partVersion: 'v1', bytes }];
    expect(() => copyBrandValidationMaterial(value.material)).toThrowError(
      'brand_validation_invalid_input',
    );
    value.material.textBytes = Buffer.from('x');
    value.material.parts = [];
    value.material.references = [
      { assetReferenceId: 'r1', assetId: 'a1', bytes },
      { assetReferenceId: 'r2', assetId: 'a2', bytes },
    ];
    expect(() => copyBrandValidationMaterial(value.material)).toThrowError(
      'brand_validation_invalid_input',
    );
  });
  it('accepts the aggregate byte boundary as privately owned copies', () => {
    const value = input();
    const bytes = Buffer.alloc(20971520);
    value.material.textBytes = bytes;
    const captured = copyBrandValidationMaterial(value.material);
    expect(captured.textBytes?.byteLength).toBe(20971520);
    bytes[0] = 1;
    expect(captured.textBytes?.[0]).toBe(0);
  });
  it('rejects sparse/material arrays and descriptor trap failures', async () => {
    const sparse = input();
    sparse.material.parts = new Array(1);
    await rejected(sparse);
    const extra = input();
    Object.defineProperty(extra.material.parts, 'extra', { value: 1 });
    await rejected(extra);
    const trapped = input();
    trapped.snapshot = new Proxy(trapped.snapshot, {
      ownKeys() {
        throw new Error('untrusted trap');
      },
    });
    await rejected(trapped);
  });
  it('preserves excluded rule categories, optional failures, semantic and empty literal unknown', async () => {
    const value = input('Guaranteed returns');
    value.snapshot.generationRules.mandatory[0].required = false;
    value.snapshot.generationRules.avoid[0].appliesToMediaKinds = ['image'];
    value.snapshot.generationRules.mandatory.push(
      {
        id: 'semantic',
        text: 'Meaning',
        match: 'semantic',
        required: true,
        evidenceIds: ['evidence-a'],
      },
      {
        id: 'empty',
        text: '\r\n ',
        match: 'literal',
        required: true,
        evidenceIds: ['evidence-a'],
      },
    );
    refresh(value);
    const report = await service.validateBrandArtifact(value);
    expect(report.checks.map((check) => check.result)).toEqual([
      'fail',
      'unknown',
      'unknown',
      'not_applicable',
      'unknown',
    ]);
    expect(
      report.diagnostics.some(
        (diagnostic) => diagnostic.code === 'brand_rule_failed',
      ),
    ).toBe(false);
    expect(report.checks[3]).toMatchObject({
      category: 'avoid_rule',
      severity: 'hard',
      reasonCode: 'rule_media_not_applicable',
    });
  });
  it('maps every capability category in canonical order without visual PASS', async () => {
    const value = input();
    const rules = value.snapshot.generationRules;
    rules.facts = [
      {
        id: 'fact',
        kind: 'statement',
        subject: 's',
        predicate: 'p',
        value: 'v',
        match: 'literal',
        required: true,
        evidenceIds: ['evidence-a'],
      },
    ];
    rules.palette = [
      {
        id: 'palette',
        color: '#123456',
        usage: 'background',
        required: true,
        evidenceIds: ['evidence-a'],
      },
    ];
    rules.typography = [
      {
        id: 'type',
        role: 'body',
        family: 'Example',
        weight: 400,
        style: 'normal',
        availability: 'unknown',
        required: true,
        evidenceIds: ['evidence-a'],
      },
    ];
    rules.assets = ['logo', 'font', 'product', 'banner', 'style'].map(
      (role) => ({
        id: `asset-${role}`,
        assetId: `ref-${role}`,
        role:
          role === 'logo'
            ? 'logo'
            : role === 'font'
              ? 'font'
              : role === 'product'
                ? 'product'
                : role === 'banner'
                  ? 'banner'
                  : 'style',
        required: true,
        evidenceIds: ['evidence-a'],
      }),
    );
    refresh(value);
    const report = await service.validateBrandArtifact(value);
    expect(report.checks.map((check) => check.category)).toEqual([
      'fact',
      'palette',
      'typography',
      'mandatory_rule',
      'avoid_rule',
      'logo',
      'typography',
      'product_identity',
      'asset_reference',
      'asset_reference',
      'fact',
    ]);
    const preflight = service.preflightBrandCapabilities({
      snapshot: value.snapshot,
      provider: 'p',
      model: 'm',
      mediaKind: 'text',
    });
    expect(preflight.status).toBe('blocked');
    expect(preflight.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'factual_coverage_unverified',
      'fact_grounding_unavailable',
      'exact_palette_unavailable',
      'exact_font_unavailable',
      'exact_logo_unavailable',
      'exact_product_unavailable',
      'exact_asset_unavailable',
    ]);
  });
  it.each([
    ['Example  Co', 'Example Co'],
    ['Example Co', ' Example Co '],
    ['Example Co\r', 'Example Co\n'],
    ['example co', 'Example Co'],
  ] as const)(
    'does not normalize unsupported differences in %s',
    async (actual, literal) => {
      const value = input(actual);
      value.snapshot.generationRules.mandatory[0].text = literal;
      refresh(value);
      expect(
        (await service.validateBrandArtifact(value)).checks[0].result,
      ).toBe('fail');
    },
  );
  it('evaluates provisional snapshots without approving or passing factual coverage', async () => {
    const value = input();
    value.snapshot.approval = 'provisional';
    refresh(value);
    const report = await service.validateBrandArtifact(value);
    expect(report.checks.at(-1)?.result).toBe('unknown');
    expect(report.snapshotHash).toBe(value.snapshot.contentHash);
  });
  it.each(['duplicateRule', 'unresolvedEvidence', 'unresolvedFont'] as const)(
    'rejects canonical %s schema disagreements',
    async (mutation) => {
      const value = input();
      if (mutation === 'duplicateRule')
        value.snapshot.generationRules.avoid[0].id =
          value.snapshot.generationRules.mandatory[0].id;
      else if (mutation === 'unresolvedEvidence')
        value.snapshot.generationRules.mandatory[0].evidenceIds = ['absent'];
      else
        value.snapshot.generationRules.typography = [
          {
            id: 'font',
            family: 'Example',
            role: 'body',
            weight: 400,
            style: 'normal',
            availability: 'owned_asset',
            fontAssetReferenceId: 'absent',
            required: true,
            evidenceIds: ['evidence-a'],
          },
        ];
      await rejected(value);
    },
  );
  it('resolves the plain service through the actual dependency-free Nest module', async () => {
    const module = await Test.createTestingModule({
      imports: [BrandValidationModule],
    }).compile();
    expect(module.get(BrandValidationService)).toBeInstanceOf(
      BrandValidationService,
    );
    await module.close();
  });
});

describe('preflight capability admission', () => {
  it.each(['unknown-provider', 'provider-v1'])(
    'supports nonempty text literals for %s without claiming factual compliance',
    (provider) => {
      const report = service.preflightBrandCapabilities({
        snapshot: snapshot(),
        provider,
        model: 'unknown-model',
        mediaKind: 'text',
      });
      expect(report.status).toBe('supported');
      expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        'factual_coverage_unverified',
      ]);
    },
  );
  it.each(['image', 'video'] as const)('blocks %s', (mediaKind) => {
    expect(
      service.preflightBrandCapabilities({
        snapshot: snapshot(),
        provider: 'p',
        model: 'm',
        mediaKind,
      }).status,
    ).toBe('blocked');
  });
  it.each(['', ' ', 'x'.repeat(513)])(
    'rejects invalid provider/model identifier',
    (value) => {
      expect(() =>
        service.preflightBrandCapabilities({
          snapshot: snapshot(),
          provider: value,
          model: 'm',
          mediaKind: 'text',
        }),
      ).toThrowError('brand_validation_invalid_input');
      expect(() =>
        service.preflightBrandCapabilities({
          snapshot: snapshot(),
          provider: 'p',
          model: value,
          mediaKind: 'text',
        }),
      ).toThrowError('brand_validation_invalid_input');
    },
  );
  it('promotes duplicate capability reason to its first required rule', () => {
    const value = snapshot();
    value.generationRules.facts = [
      {
        id: 'optional-fact',
        kind: 'statement',
        subject: 's',
        predicate: 'p',
        value: 29,
        match: 'literal',
        required: false,
        evidenceIds: ['evidence-a'],
      },
      {
        id: 'required-fact',
        kind: 'statement',
        subject: 's',
        predicate: 'p',
        value: 99,
        match: 'semantic',
        required: true,
        evidenceIds: ['evidence-a'],
      },
    ];
    value.contentHash = hashBrandIdentitySnapshotV1(value);
    const report = service.preflightBrandCapabilities({
      snapshot: value,
      provider: 'p',
      model: 'm',
      mediaKind: 'text',
    });
    expect(report.status).toBe('blocked');
    expect(report.diagnostics[1]).toMatchObject({
      code: 'fact_grounding_unavailable',
      severity: 'error',
      ruleId: 'required-fact',
    });
  });
  it('handles optional/semantic/empty/universal/excluded rule capability distinctly', () => {
    const value = snapshot();
    value.generationRules.mandatory[0].match = 'semantic';
    value.generationRules.mandatory[0].required = false;
    value.generationRules.avoid[0].text = '\r\n ';
    value.generationRules.avoid[0].appliesToMediaKinds = ['image'];
    value.contentHash = hashBrandIdentitySnapshotV1(value);
    const report = service.preflightBrandCapabilities({
      snapshot: value,
      provider: 'p',
      model: 'm',
      mediaKind: 'text',
    });
    expect(report.status).toBe('supported');
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'factual_coverage_unverified',
      'semantic_validation_unavailable',
    ]);
    delete value.generationRules.avoid[0].appliesToMediaKinds;
    value.contentHash = hashBrandIdentitySnapshotV1(value);
    expect(
      service
        .preflightBrandCapabilities({
          snapshot: value,
          provider: 'p',
          model: 'm',
          mediaKind: 'text',
        })
        .diagnostics.at(-1)?.code,
    ).toBe('empty_literal_rule');
  });
});
