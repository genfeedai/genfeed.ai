import { describe, expect, it } from 'vitest';
import { buildLogicalWriteKey } from '../server';

describe('buildLogicalWriteKey', () => {
  it('distinguishes scoped intents while preserving absent-scope keys', () => {
    const input = {
      arguments: { count: 3 },
      organizationId: 'org-1',
      userId: 'user-1',
      threadId: 'thread-1',
      toolName: 'generate_content_batch',
    };
    const original = buildLogicalWriteKey(input);
    expect(buildLogicalWriteKey({ ...input, scope: undefined })).toBe(original);
    const scoped = buildLogicalWriteKey({
      ...input,
      scope: { brandId: 'brand-1', contextVersion: 1 },
    });
    expect(scoped).not.toBe(original);
    expect(
      buildLogicalWriteKey({
        ...input,
        scope: { brandId: 'brand-1', contextVersion: 2 },
      }),
    ).not.toBe(scoped);
    expect(
      buildLogicalWriteKey({
        ...input,
        scope: { brandId: 'brand-2', contextVersion: 1 },
      }),
    ).not.toBe(scoped);
  });

  it('is stable across key order and distinct across arguments', () => {
    const base = {
      organizationId: 'org-1',
      threadId: 'thread-1',
      toolName: 'create_post',
      userId: 'user-1',
    };
    expect(
      buildLogicalWriteKey({
        ...base,
        arguments: { b: 2, a: 1 },
      }),
    ).toBe(
      buildLogicalWriteKey({
        ...base,
        arguments: { a: 1, b: 2 },
      }),
    );
    expect(
      buildLogicalWriteKey({
        ...base,
        arguments: { a: 1 },
      }),
    ).not.toBe(
      buildLogicalWriteKey({
        ...base,
        arguments: { a: 2 },
      }),
    );
  });
});

// Captured from the original implementation at 61ba9e964 on Studio.
const BASE_INPUT = {
  arguments: {
    z: {
      two: 2,
      one: 1,
    },
    a: [3, 2, 1],
    unicode: 'créateur 🚀',
    null: null,
    flag: true,
    number: -1.25,
  },
  organizationId: 'org-α',
  toolName: 'create_post',
  userId: 'user-1',
};

const GOLDEN_VECTORS = [
  {
    name: 'nested-unicode-primitives',
    input: { ...BASE_INPUT },
    expected:
      'c5c9c895fc650e5de69cb12a99df41df2199e419f0dfb1d0ee4e1f4cfd17ff85',
  },
  {
    name: 'reordered-objects',
    input: {
      ...BASE_INPUT,
      arguments: {
        number: -1.25,
        flag: true,
        null: null,
        unicode: 'créateur 🚀',
        a: [3, 2, 1],
        z: { one: 1, two: 2 },
      },
    },
    expected:
      'c5c9c895fc650e5de69cb12a99df41df2199e419f0dfb1d0ee4e1f4cfd17ff85',
  },
  {
    name: 'ordered-array-changes',
    input: {
      ...BASE_INPUT,
      arguments: {
        z: { two: 2, one: 1 },
        a: [1, 2, 3],
        unicode: 'créateur 🚀',
        null: null,
        flag: true,
        number: -1.25,
      },
    },
    expected:
      '349ea38cc7053495b8bb84b2ba166d0661e16b418b0cdaea8fef072e66973ddc',
  },
  {
    name: 'empty-thread',
    input: { ...BASE_INPUT, threadId: '' },
    expected:
      'c5c9c895fc650e5de69cb12a99df41df2199e419f0dfb1d0ee4e1f4cfd17ff85',
  },
  {
    name: 'present-thread',
    input: { ...BASE_INPUT, threadId: 'thread-1' },
    expected:
      '17ba44b3e94352743230059d08e61ebfed928b8ea838c2053af121354b8e8018',
  },
  {
    name: 'scope-without-brand',
    input: { ...BASE_INPUT, scope: { contextVersion: 1 } },
    expected:
      '2426341d7a7a84f93f52d8054534ca0f742b79dffe5509cef898ff825a68d67b',
  },
  {
    name: 'scope-empty-brand',
    input: { ...BASE_INPUT, scope: { brandId: '', contextVersion: 1 } },
    expected:
      'e43708a3d3ec9d4cbccf072b5c809662f2253101ed597e29888267c30561c1a3',
  },
  {
    name: 'scope-brand',
    input: { ...BASE_INPUT, scope: { brandId: 'brand-1', contextVersion: 1 } },
    expected:
      'ddc9cb71d988c608cebc0c160e89617cc7df3a8ad72734c0ed0a306e30ba3cfa',
  },
  {
    name: 'scope-context-change',
    input: { ...BASE_INPUT, scope: { brandId: 'brand-1', contextVersion: 2 } },
    expected:
      '87d23270f200838b03e3869ee8be63ca49b53333e998deb0af34ca7ab94ba2aa',
  },
  {
    name: 'scope-brand-change',
    input: { ...BASE_INPUT, scope: { brandId: 'brand-2', contextVersion: 1 } },
    expected:
      '981fdcf4e8fb2fa03d20830a34069b63f147969b6189a0d02202f89db3826b5e',
  },
  {
    name: 'tenant-change',
    input: { ...BASE_INPUT, organizationId: 'org-β' },
    expected:
      'cf350839038c8775779110cdb7d4ab56777e476e768c34c7472193e4eb93c76f',
  },
  {
    name: 'user-change',
    input: { ...BASE_INPUT, userId: 'user-2' },
    expected:
      '6a628c0e5adde166a3dd20b0af65a5131981e1543807b3bc87b00b9dcbe2aa61',
  },
  {
    name: 'empty-arguments',
    input: { ...BASE_INPUT, arguments: {} },
    expected:
      'f99dd91fe09b4ac270e1e55de1d76a3b6baa23a38766ae7f52133640c4ffa895',
  },
];

describe('logical write key compatibility', () => {
  it.each(GOLDEN_VECTORS)(
    'preserves the original digest for $name',
    ({ input, expected }) => {
      const key = buildLogicalWriteKey(input);
      expect(typeof key).toBe('string');
      expect(key).toBe(expected);
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    },
  );
});
