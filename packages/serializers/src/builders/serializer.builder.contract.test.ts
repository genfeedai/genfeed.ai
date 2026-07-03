import { describe, expect, it } from 'vitest';
import { buildSerializer, rel, simpleConfig } from './serializer.builder';

/**
 * Wire-format contract tests for the Mongo-to-Postgres id cleanup (#1096).
 *
 * They pin the exact JSON:API output for records shaped the way
 * `BaseService.normalizeDocument` emits them. The dominant case (scalar
 * relationship ids) was verified byte-identical against the pre-cleanup
 * output (`id: '_id'` mapping + ResponseIdNormalizerInterceptor). Three
 * deliberate behavior changes are pinned explicitly below:
 *
 * 1. Records carrying a legacy `mongoId` now serialize with the canonical
 *    Prisma `id` (cuid) — previously the legacy Mongo hex id leaked out.
 * 2. Records that never passed `normalizeDocument` (no `_id` alias) now
 *    serialize with their real id — previously `id: "undefined"`.
 * 3. Hydrated relation objects now emit relationship linkage + `included`
 *    resources — previously `ref: '_id'` never matched and populate data
 *    was silently dropped from responses.
 */

const postConfig = {
  attributes: [
    'label',
    'status',
    'user',
    'organization',
    'brand',
    'tags',
    'createdAt',
    'updatedAt',
    'isDeleted',
  ],
  brand: rel('brand', ['label', 'slug']),
  organization: rel('organization', ['label']),
  tags: rel('tag', ['label']),
  type: 'post',
  user: rel('user', ['firstName', 'lastName']),
};

const CREATED_AT = new Date('2026-01-15T10:00:00.000Z');
const UPDATED_AT = new Date('2026-02-20T12:30:00.000Z');

/** Record as BaseService.normalizeDocument returns it (post-migration row). */
function makeNormalizedPost(): Record<string, unknown> {
  return {
    _id: 'ckpost0000000000000000001',
    brand: 'ckbrand000000000000000001',
    brandId: 'ckbrand000000000000000001',
    createdAt: CREATED_AT,
    id: 'ckpost0000000000000000001',
    isDeleted: false,
    label: 'Hello world',
    organization: 'ckorg00000000000000000001',
    organizationId: 'ckorg00000000000000000001',
    status: 'published',
    tags: ['cktag00000000000000000001'],
    updatedAt: UPDATED_AT,
    user: 'ckuser0000000000000000001',
    userId: 'ckuser0000000000000000001',
  };
}

const EXPECTED_POST_RESOURCE = {
  attributes: {
    createdAt: CREATED_AT,
    isDeleted: false,
    label: 'Hello world',
    status: 'published',
    updatedAt: UPDATED_AT,
  },
  id: 'ckpost0000000000000000001',
  relationships: {
    brand: { data: null },
    organization: { data: null },
    tags: { data: [null] },
    user: { data: null },
  },
  type: 'post',
};

describe('server serializer wire contract (#1096)', () => {
  it('serializes a normalized record with scalar relationship ids (byte-identical to pre-cleanup output)', () => {
    const { PostSerializer } = buildSerializer('server', postConfig);
    const output = PostSerializer.serialize(makeNormalizedPost());

    expect(output).toEqual({ data: EXPECTED_POST_RESOURCE });
  });

  it('serializes a collection (byte-identical to pre-cleanup output)', () => {
    const { PostSerializer } = buildSerializer('server', postConfig);
    const output = PostSerializer.serialize([makeNormalizedPost()]);

    expect(output).toEqual({ data: [EXPECTED_POST_RESOURCE] });
  });

  it('emits the canonical Prisma id for migrated records carrying a legacy mongoId', () => {
    const { PostSerializer } = buildSerializer('server', postConfig);
    const record = {
      ...makeNormalizedPost(),
      mongoId: '64a1b2c3d4e5f6a7b8c9d0e1',
    };
    const output = PostSerializer.serialize(record) as {
      data: { id: string };
    };

    // Behavior change vs pre-cleanup: the legacy Mongo hex id no longer
    // leaks out as the public id. Inbound lookups by mongoId still resolve
    // via the OR-clause in BaseService.processSearchParams.
    expect(output.data.id).toBe('ckpost0000000000000000001');
  });

  it('serializes records that never passed normalizeDocument with their real id', () => {
    const { ThingSerializer } = buildSerializer(
      'server',
      simpleConfig('thing', ['label']),
    );
    const output = ThingSerializer.serialize({
      id: 'ckthing000000000000000001',
      label: 'raw',
    });

    // Pre-cleanup this produced `id: "undefined"` because the record had no
    // `_id` alias for the serializer to read.
    expect(output).toEqual({
      data: {
        attributes: { label: 'raw' },
        id: 'ckthing000000000000000001',
        type: 'thing',
      },
    });
  });

  it('emits relationship linkage and included resources for hydrated relations', () => {
    const { PostSerializer } = buildSerializer('server', postConfig);
    const record = {
      ...makeNormalizedPost(),
      user: {
        firstName: 'Vincent',
        id: 'ckuser0000000000000000001',
        lastName: 'Founder',
      },
    };
    const output = PostSerializer.serialize(record) as {
      data: {
        relationships: { user: { data: unknown } };
      };
      included: unknown[];
    };

    // Pre-cleanup `ref: '_id'` never matched hydrated Prisma relations, so
    // populate data was silently dropped (relationship data stayed null and
    // nothing was pushed to `included`).
    expect(output.data.relationships.user.data).toEqual({
      id: 'ckuser0000000000000000001',
      type: 'user',
    });
    expect(output.included).toEqual([
      {
        attributes: { firstName: 'Vincent', lastName: 'Founder' },
        id: 'ckuser0000000000000000001',
        type: 'user',
      },
    ]);
  });

  it('produces the same id mapping for client and server package types', () => {
    const config = simpleConfig('thing', ['label']);
    const { ThingSerializer: serverSerializer } = buildSerializer(
      'server',
      config,
    );
    const { ThingSerializer: clientSerializer } = buildSerializer(
      'client',
      config,
    );
    const record = { id: 'ckthing000000000000000001', label: 'raw' };

    expect(serverSerializer.serialize(record)).toEqual(
      clientSerializer.serialize(record),
    );
  });
});
