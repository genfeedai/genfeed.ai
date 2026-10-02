import { createHash } from 'node:crypto';
import {
  buildLearningBaselineMaterialization,
  type LearningBaselineMaterializationInput,
} from '@api/collections/content-learning/services/learning-baseline-materialization.helper';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import type { LearningCellDescriptor } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
const AGE = 90 * 86400000;
const literalDescriptor: LearningCellDescriptor = {
  platform: 'twitter',
  format: 'text',
  objective: 'engagement',
  exposureSource: 'impressions',
  metricWeights: [
    ['comments', 2],
    ['likes', 1],
    ['shares', 4],
  ],
  retention: false,
  windowId: '48h-v1',
  configVersion: 'rl-reward-v1-experimental',
  featureSchema: 'numeric-nine-v1',
  armCatalogVersion: 'learning-arms-v1',
};
function descriptor(retention = false): LearningCellDescriptor {
  const profile = retention
    ? learningRegisteredProfiles('youtube', 'video', 'retention-watch')[0]
    : learningRegisteredProfiles('twitter', 'text', 'engagement').find(
        (row) =>
          JSON.stringify(row.descriptor) === JSON.stringify(literalDescriptor),
      );
  expect(profile).toBeDefined();
  if (!profile)
    throw new Error('Registered materialization fixture unavailable');
  return structuredClone(profile.descriptor);
}
function fixture(
  overrides: Partial<LearningBaselineMaterializationInput> = {},
): LearningBaselineMaterializationInput {
  const cell = descriptor();
  return {
    descriptor: cell,
    scope: {
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      platform: 'twitter',
      format: 'text',
      objective: 'engagement',
      rewardProfileId: learningHash(learningDescriptorTuple(cell)),
    },
    epoch: 2,
    evidenceRevision: 7,
    cutoff: new Date('2026-10-01T00:00:00.000Z'),
    contributors: [
      {
        id: 'checkpoint-a',
        postId: 'post-a',
        revision: 1,
        receivedAt: new Date('2026-09-30T00:00:00.000Z'),
      },
      {
        id: 'checkpoint-b',
        postId: 'post-b',
        revision: 2,
        receivedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ],
    samples: [
      { exposure: 100, weightedActions: 10 },
      { exposure: 300, weightedActions: 30, averageWatchTimeSeconds: 0 },
    ],
    ...overrides,
  };
}
function reject(input: LearningBaselineMaterializationInput) {
  const before = structuredClone(input);
  expect(() => buildLearningBaselineMaterialization(input)).toThrow(
    BadRequestException,
  );
  expect(() => buildLearningBaselineMaterialization(input)).toThrow(
    'Invalid baseline materialization input',
  );
  expect(input).toEqual(before);
}
function withCount(count: number): LearningBaselineMaterializationInput {
  return fixture({
    contributors: Array.from({ length: count }, (_, i) => ({
      id: `checkpoint-${i}`,
      postId: `post-${i}`,
      revision: i,
      receivedAt: new Date('2026-09-30T00:00:00.000Z'),
    })),
    samples: Array.from({ length: count }, (_, i) => ({
      exposure: i,
      weightedActions: 0,
    })),
  });
}
function setDescriptor(
  input: LearningBaselineMaterializationInput,
  cell: LearningCellDescriptor,
) {
  input.descriptor = cell;
  input.scope = {
    ...input.scope,
    platform: cell.platform,
    format: cell.format,
    objective: cell.objective,
    rewardProfileId: learningHash(learningDescriptorTuple(cell)),
  };
}

describe('learning baseline materialization projection', () => {
  it('T1 binds the independent fixed tuple, midpoint median and oldest expiry', () => {
    const input = fixture();
    expect(input.descriptor).toEqual(literalDescriptor);
    const hash = (value: unknown) =>
      createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const descriptorHash = hash([
      'twitter',
      'text',
      'engagement',
      'impressions',
      [
        ['comments', 2],
        ['likes', 1],
        ['shares', 4],
      ],
      false,
      '48h-v1',
      'rl-reward-v1-experimental',
      'numeric-nine-v1',
      'learning-arms-v1',
    ]);
    const scopeKey = hash([
      'org',
      'brand',
      'credential',
      'twitter',
      'text',
      'engagement',
      descriptorHash,
    ]);
    const fingerprint = hash([
      'baseline-materialization-v1',
      scopeKey,
      descriptorHash,
      2,
      7,
      '2026-10-01T00:00:00.000Z',
      [
        ['checkpoint-a', 1, '2026-09-30T00:00:00.000Z', 100, 10, null],
        ['checkpoint-b', 2, '2026-09-01T00:00:00.000Z', 300, 30, 0],
      ],
    ]);
    const output = buildLearningBaselineMaterialization(input);
    expect(output).toEqual({
      scopeKey,
      descriptorHash,
      fingerprint,
      epoch: 2,
      evidenceRevision: 7,
      cutoff: new Date('2026-10-01T00:00:00.000Z'),
      expiresAt: new Date('2026-11-30T00:00:00.000Z'),
      contributorCheckpointIds: ['checkpoint-a', 'checkpoint-b'],
      contributorRevisions: [1, 2],
      samples: [
        { exposure: 100, weightedActions: 10 },
        { exposure: 300, weightedActions: 30, averageWatchTimeSeconds: 0 },
      ],
      count: 2,
      medianExposure: 200,
    });
    expect(output.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(
      buildLearningBaselineMaterialization(structuredClone(input)),
    ).toEqual(output);
    expect(output.cutoff).not.toBe(input.cutoff);
    expect(output.samples).not.toBe(input.samples);
    expect(output.samples[0]).not.toBe(input.samples[0]);
  });
  const mutations: Array<{
    name: string;
    apply: (input: LearningBaselineMaterializationInput) => void;
  }> = [
    {
      name: 'organization',
      apply: (i) => {
        i.scope.organizationId = 'other-org';
      },
    },
    {
      name: 'brand',
      apply: (i) => {
        i.scope.brandId = 'other-brand';
      },
    },
    {
      name: 'credential',
      apply: (i) => {
        i.scope.credentialId = 'other-credential';
      },
    },
    {
      name: 'epoch',
      apply: (i) => {
        i.epoch++;
      },
    },
    {
      name: 'evidence',
      apply: (i) => {
        i.evidenceRevision++;
      },
    },
    {
      name: 'cutoff',
      apply: (i) => {
        i.cutoff.setTime(i.cutoff.getTime() + 1);
      },
    },
    {
      name: 'checkpoint',
      apply: (i) => {
        i.contributors[0].id = 'other-checkpoint';
      },
    },
    {
      name: 'revision',
      apply: (i) => {
        i.contributors[0].revision++;
      },
    },
    {
      name: 'received',
      apply: (i) => {
        i.contributors[0].receivedAt.setTime(
          i.contributors[0].receivedAt.getTime() + 1,
        );
      },
    },
    {
      name: 'exposure',
      apply: (i) => {
        i.samples[0].exposure++;
      },
    },
    {
      name: 'actions',
      apply: (i) => {
        i.samples[0].weightedActions++;
      },
    },
    {
      name: 'watch',
      apply: (i) => {
        i.samples[0].averageWatchTimeSeconds = 0;
      },
    },
  ];
  it.each(mutations)('T2 changes identity for $name', ({ apply }) => {
    const input = fixture();
    const original = buildLearningBaselineMaterialization(input).fingerprint;
    apply(input);
    expect(buildLearningBaselineMaterialization(input).fingerprint).not.toBe(
      original,
    );
  });
  it('T2 binds a registered profile variant and delimiter-safe scope', () => {
    const input = fixture();
    const original = buildLearningBaselineMaterialization(input).fingerprint;
    const variant = learningRegisteredProfiles(
      'twitter',
      'text',
      'engagement',
    ).find((row) => row.capability.mask === 'LCSS');
    if (!variant) throw new Error('Registered profile variant unavailable');
    setDescriptor(input, structuredClone(variant.descriptor));
    expect(buildLearningBaselineMaterialization(input).fingerprint).not.toBe(
      original,
    );
    const a = fixture();
    a.scope.organizationId = 'org|brand';
    a.scope.brandId = 'tail';
    const b = fixture();
    b.scope.organizationId = 'org';
    b.scope.brandId = 'brand|tail';
    expect(buildLearningBaselineMaterialization(a).fingerprint).not.toBe(
      buildLearningBaselineMaterialization(b).fingerprint,
    );
  });
  it('T2 ignores extra row/sample properties and preserves tied input order', () => {
    const input = fixture();
    const original = buildLearningBaselineMaterialization(input);
    Reflect.set(input.contributors[0], 'unrelated', 'extra');
    Reflect.set(input.samples[0], 'unrelated', 123);
    expect(buildLearningBaselineMaterialization(input)).toEqual(original);
    input.contributors[1].receivedAt = new Date(
      input.contributors[0].receivedAt.getTime(),
    );
    const tied = buildLearningBaselineMaterialization(input);
    input.contributors = [...input.contributors].reverse();
    input.samples = [...input.samples].reverse();
    const swapped = buildLearningBaselineMaterialization(input);
    expect(swapped.fingerprint).not.toBe(tied.fingerprint);
    expect(swapped.contributorCheckpointIds).toEqual([
      'checkpoint-b',
      'checkpoint-a',
    ]);
    expect(swapped.samples.map((row) => row.exposure)).toEqual([300, 100]);
  });
  it.each([0, 19, 20, 50])(
    'T3 projects count %i without eligibility authority',
    (count) => {
      const output = buildLearningBaselineMaterialization(withCount(count));
      expect(output.count).toBe(count);
      expect(output.samples).toHaveLength(count);
      for (const key of [
        'validity',
        'eligible',
        'current',
        'applied',
        'status',
      ])
        expect(output).not.toHaveProperty(key);
      if (!count) {
        expect(output.medianExposure).toBe(0);
        expect(output.expiresAt).toBeNull();
      } else
        expect(output.samples[0]).toEqual({ exposure: 0, weightedActions: 0 });
    },
  );
  it('T3 rejects overflow count, length mismatch and duplicate checkpoints/Posts', () => {
    reject(withCount(51));
    const mismatch = fixture();
    mismatch.samples = mismatch.samples.slice(1);
    reject(mismatch);
    const ids = fixture();
    ids.contributors[1].id = ids.contributors[0].id;
    reject(ids);
    const posts = fixture();
    posts.contributors[1].postId = posts.contributors[0].postId;
    reject(posts);
  });
  it.each([-AGE, 0])('T4 accepts inclusive age offset %i', (offset) => {
    const input = withCount(1);
    input.contributors[0].receivedAt = new Date(
      input.cutoff.getTime() + offset,
    );
    const output = buildLearningBaselineMaterialization(input);
    expect(output.expiresAt?.getTime()).toBe(
      input.cutoff.getTime() + offset + AGE,
    );
  });
  it.each([-AGE - 1, 1])('T4 rejects outside age offset %i', (offset) => {
    const input = withCount(1);
    input.contributors[0].receivedAt = new Date(
      input.cutoff.getTime() + offset,
    );
    reject(input);
  });
  it('T4 oldest received time controls expiry independently of input order', () => {
    const input = fixture();
    input.contributors = [...input.contributors].reverse();
    input.samples = [...input.samples].reverse();
    expect(buildLearningBaselineMaterialization(input).expiresAt).toEqual(
      new Date('2026-11-30T00:00:00.000Z'),
    );
  });
  it('T4 rejects invalid dates and expiry Date overflow uniformly', () => {
    reject(fixture({ cutoff: new Date(NaN) }));
    const received = fixture();
    received.contributors[0].receivedAt = new Date(NaN);
    reject(received);
    const overflow = withCount(1);
    overflow.cutoff = new Date(8640000000000000);
    overflow.contributors[0].receivedAt = new Date(overflow.cutoff.getTime());
    reject(overflow);
  });
  it('T4 historical explicit cutoff never reads the wall clock', () => {
    const input = fixture();
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(0);
      const first = buildLearningBaselineMaterialization(input);
      clock.mockReturnValue(8640000000000000);
      expect(buildLearningBaselineMaterialization(input)).toEqual(first);
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });
  it.each([0, 2147483647])('T5 accepts integer endpoint %i', (value) => {
    const input = fixture({ epoch: value, evidenceRevision: value });
    input.contributors[0].revision = value;
    expect(
      buildLearningBaselineMaterialization(input).contributorRevisions[0],
    ).toBe(value);
  });
  it.each([-1, 0.5, NaN, Infinity, 2147483648])(
    'T5 rejects counter %s in each field',
    (value) => {
      reject(fixture({ epoch: value }));
      reject(fixture({ evidenceRevision: value }));
      const input = fixture();
      input.contributors[0].revision = value;
      reject(input);
    },
  );
  it.each([-1, NaN, Infinity, -Infinity, null, '1'])(
    'T5 rejects malformed metric %s',
    (value) => {
      for (const key of [
        'exposure',
        'weightedActions',
        'averageWatchTimeSeconds',
      ]) {
        const input = fixture();
        Reflect.set(input.samples[0], key, value);
        reject(input);
      }
    },
  );
  it('T5 distinguishes absent watch from zero and requires real retention observations', () => {
    const input = fixture();
    const absent = buildLearningBaselineMaterialization(input);
    input.samples[0].averageWatchTimeSeconds = 0;
    expect(buildLearningBaselineMaterialization(input).fingerprint).not.toBe(
      absent.fingerprint,
    );
    setDescriptor(input, descriptor(true));
    expect(
      buildLearningBaselineMaterialization(input).samples[0]
        .averageWatchTimeSeconds,
    ).toBe(0);
    Reflect.deleteProperty(input.samples[0], 'averageWatchTimeSeconds');
    reject(input);
  });
  it('T5 rejects a finite-input median overflow', () => {
    const input = fixture();
    input.samples.forEach((row) => {
      row.exposure = Number.MAX_VALUE;
    });
    reject(input);
  });
  it.each(['organizationId', 'brandId', 'credentialId'])(
    'T6 rejects padded/empty scope %s',
    (key) => {
      for (const value of ['', ' padded', 'padded ', null, 1]) {
        const input = fixture();
        Reflect.set(input.scope, key, value);
        reject(input);
      }
    },
  );
  it.each(['id', 'postId'])('T6 rejects padded/empty contributor %s', (key) => {
    for (const value of ['', ' padded', 'padded ', null, 1]) {
      const input = fixture();
      Reflect.set(input.contributors[0], key, value);
      reject(input);
    }
  });
  it.each(['platform', 'format', 'objective', 'rewardProfileId'])(
    'T6 rejects mismatched scope %s',
    (key) => {
      const input = fixture();
      Reflect.set(input.scope, key, 'other');
      reject(input);
    },
  );
  it('T6 rejects malformed/unregistered/extra-key descriptors without TypeError or mutation', () => {
    for (const value of [null, [], 'descriptor', { platform: 'twitter' }]) {
      const input = fixture();
      Reflect.set(input, 'descriptor', value);
      reject(input);
    }
    const unserializable = fixture();
    Reflect.set(unserializable.descriptor.metricWeights[0], 1, 1n);
    reject(unserializable);
    const missing = fixture();
    Reflect.deleteProperty(missing.descriptor, 'metricWeights');
    reject(missing);
    const extra = fixture();
    Reflect.set(extra.descriptor, 'extra', true);
    reject(extra);
    const unknown = fixture();
    Reflect.set(unknown.descriptor, 'configVersion', 'unknown');
    reject(unknown);
  });
  it('T7 isolates returned projection from later input mutations', () => {
    const input = fixture();
    const output = buildLearningBaselineMaterialization(input);
    const before = structuredClone(output);
    input.samples[0].exposure = 999;
    input.contributors[0].revision = 99;
    input.contributors[0].receivedAt.setTime(0);
    input.cutoff.setTime(0);
    input.samples = [];
    input.contributors = [];
    expect(output).toEqual(before);
  });
  it('T7 isolates original input from returned arrays, samples and dates', () => {
    const input = fixture();
    const before = structuredClone(input);
    const output = buildLearningBaselineMaterialization(input);
    const hash = output.fingerprint;
    output.samples[0].exposure = 999;
    output.samples.push({ exposure: 0, weightedActions: 0 });
    output.contributorCheckpointIds[0] = 'changed';
    output.contributorRevisions[0] = 99;
    output.cutoff.setTime(0);
    output.expiresAt?.setTime(0);
    expect(input).toEqual(before);
    expect(output.fingerprint).toBe(hash);
  });
});
