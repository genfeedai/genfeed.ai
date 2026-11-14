import { PostGroupBatchService } from '@api/collections/post-groups/services/post-group-batch.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

interface Release {
  title: string;
  brandId?: string;
  baseContent?: string;
  media?: { assetId: string; order?: number }[];
  targets?: Record<string, unknown>[];
  scheduledDate?: string;
}

const ONE_CHANNEL = [{ credentialId: 'cred-1', platform: 'twitter' }];

function build(
  overrides: {
    create?: (input: Record<string, unknown>) => Promise<{ id: string }>;
    parse?: (release: unknown) => never | { targets: never[] };
    credentials?: Record<string, unknown>[];
    ingredients?: Record<string, unknown>[];
    brands?: Record<string, unknown>[];
  } = {},
) {
  const createdKeys: unknown[] = [];
  const prisma = {
    brand: { findMany: async () => overrides.brands ?? [] },
    credential: { findMany: async () => overrides.credentials ?? [] },
    ingredient: { findMany: async () => overrides.ingredients ?? [] },
  };
  const logger = { error: () => undefined };
  const contractService = {
    parseCreateInput: (release: unknown) => {
      if (overrides.parse) return overrides.parse(release);
      return { targets: [] };
    },
    resolveCreateStatus: () => 'draft',
  };
  const postGroupsService = {
    create: async (
      _organizationId: string,
      _userId: string,
      input: Record<string, unknown>,
    ) => {
      createdKeys.push(input.idempotencyKey);
      return overrides.create
        ? overrides.create(input)
        : { id: `release-${String(input.idempotencyKey)}` };
    },
  };
  const service = new PostGroupBatchService(
    prisma as never,
    logger as never,
    contractService as never,
    {
      resolveBrandId: async () => undefined,
      resolveCredentials: async () => [],
    } as never,
    { resolveForCredentials: async () => new Map() } as never,
    postGroupsService as never,
  );
  return { createdKeys, service };
}

describe('PostGroupBatchService.assertBatchShape', () => {
  it.each([
    ['a missing list', undefined],
    ['an empty list', []],
    ['more than 50 releases', Array.from({ length: 51 }, () => ({}))],
  ])('refuses %s', (_label, releases) => {
    const { service } = build();
    expect(() => service.assertBatchShape(releases)).toThrow(
      BadRequestException,
    );
  });

  it('accepts 1 to 50 releases', () => {
    const { service } = build();
    expect(() =>
      service.assertBatchShape(Array.from({ length: 50 }, () => ({}))),
    ).not.toThrow();
  });
});

describe('PostGroupBatchService.validate', () => {
  it('names each release the single-release rules refuse, by position', async () => {
    const { service } = build({
      parse: (release) => {
        if ((release as Release).title === 'bad') {
          throw new BadRequestException('title is too long for twitter');
        }
        return { targets: [] };
      },
    });

    const errors = await service.validate('org-1', [
      { targets: ONE_CHANNEL, title: 'ok' },
      { targets: ONE_CHANNEL, title: 'bad' },
      { targets: ONE_CHANNEL, title: 'ok too' },
    ]);

    expect(errors).toEqual([
      { index: 1, message: 'title is too long for twitter' },
    ]);
  });

  it('reports nothing for a batch the rules accept', async () => {
    const { service } = build();

    expect(
      await service.validate('org-1', [
        { targets: ONE_CHANNEL, title: 'a' },
        { targets: ONE_CHANNEL, title: 'b' },
      ]),
    ).toEqual([]);
  });

  it('never leaks the text of an unexpected failure', async () => {
    const { service } = build({
      parse: () => {
        throw new Error('connection string postgres://secret');
      },
    });

    const errors = await service.validate('org-1', [
      { targets: ONE_CHANNEL, title: 'a' },
    ]);

    expect(errors).toEqual([
      { index: 0, message: 'This release could not be scheduled.' },
    ]);
  });
});

describe('PostGroupBatchService.assertBrandAccess', () => {
  const limited = ['brand-a'];

  it.each([
    ['a release naming another brand', [{ brandId: 'brand-b' }], []],
    [
      'a channel account of another brand',
      [{ targets: ONE_CHANNEL }],
      [{ brandId: 'brand-b', id: 'cred-1' }],
    ],
    [
      'a channel account with no brand',
      [{ targets: ONE_CHANNEL }],
      [{ brandId: null, id: 'cred-1' }],
    ],
  ])(
    'hides %s from a key limited to brand-a',
    async (_name, releases, credentials) => {
      const { service } = build({ credentials });

      await expect(
        service.assertBrandAccess('org-1', releases, limited),
      ).rejects.toThrow(NotFoundException);
    },
  );

  it('hides media of another brand from a key limited to brand-a', async () => {
    const { service } = build({ ingredients: [{ brandId: 'brand-b' }] });

    await expect(
      service.assertBrandAccess(
        'org-1',
        [{ media: [{ assetId: 'asset-1' }] }],
        limited,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('lets a key limited to brand-a use its own brand and accounts', async () => {
    const { service } = build({
      credentials: [{ brandId: 'brand-a', id: 'cred-1' }],
    });

    await expect(
      service.assertBrandAccess(
        'org-1',
        [{ brandId: 'brand-a', targets: ONE_CHANNEL }],
        limited,
      ),
    ).resolves.toBeUndefined();
  });

  it('checks nothing for a key with no brand limit', async () => {
    const { service } = build({
      credentials: [{ brandId: 'brand-z', id: 'cred-1' }],
    });

    await expect(
      service.assertBrandAccess(
        'org-1',
        [{ brandId: 'brand-b', targets: ONE_CHANNEL }],
        undefined,
      ),
    ).resolves.toBeUndefined();
  });
});

describe('what a reviewer cannot see is refused', () => {
  const refused = [
    ['two channel targets', { targets: [ONE_CHANNEL[0], ONE_CHANNEL[0]] }],
    ['no channel target', { targets: [] }],
    [
      'recurrence',
      { recurrence: { frequency: 'daily' }, targets: ONE_CHANNEL },
    ],
    ['attachments', { attachments: [{ url: 'x' }], targets: ONE_CHANNEL }],
    [
      'target settings',
      { targets: [{ ...ONE_CHANNEL[0], settings: { privacy: 'public' } }] },
    ],
  ] as const;

  it.each(refused)(
    'validate names a release with %s',
    async (_name, release) => {
      const { service } = build();

      const errors = await service.validate('org-1', [
        { title: 'a', ...release },
      ]);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.index).toBe(0);
    },
  );

  it.each(refused)(
    'create schedules nothing for a release with %s',
    async (_name, release) => {
      const { createdKeys, service } = build();

      const result = await service.create(
        'org-1',
        'user-1',
        [{ title: 'a', ...release }],
        {
          keyBase: 'k',
        },
      );

      expect(createdKeys).toEqual([]);
      expect(result.created).toEqual([]);
      expect(result.errors).toHaveLength(1);
    },
  );

  it('names the fields the review does not show', async () => {
    const { service } = build();

    const errors = await service.validate('org-1', [
      {
        attachments: [{ url: 'x' }],
        recurrence: { frequency: 'daily' },
        targets: ONE_CHANNEL,
      },
    ]);

    expect(errors[0]?.message).toContain('recurrence, attachments');
  });
});

describe('PostGroupBatchService.create waiting for approval', () => {
  it('names a scheduled release whose time passed while it waited', async () => {
    const { createdKeys, service } = build({
      parse: () =>
        ({
          scheduledDate: '2020-01-01T00:00:00.000Z',
          targets: [],
        }) as never,
    });
    const scheduling = service as unknown as {
      contractService: { resolveCreateStatus: () => string };
    };
    scheduling.contractService.resolveCreateStatus = () => 'scheduled';

    const result = await service.create(
      'org-1',
      'user-1',
      [{ targets: ONE_CHANNEL, title: 'late' }],
      { keyBase: 'k' },
    );

    expect(createdKeys).toEqual([]);
    expect(result.errors).toEqual([
      { index: 0, message: 'The scheduled time has passed.' },
    ]);
  });
});

describe('PostGroupBatchService.create', () => {
  it('creates every release under a per-position idempotency key', async () => {
    const { createdKeys, service } = build();

    const result = await service.create(
      'org-1',
      'user-1',
      [
        { targets: ONE_CHANNEL, title: 'a' },
        { targets: ONE_CHANNEL, title: 'b' },
      ],
      { keyBase: 'approval-1' },
    );

    expect(createdKeys).toEqual(['approval-1:0', 'approval-1:1']);
    expect(result).toEqual({
      created: [
        { index: 0, releaseId: 'release-approval-1:0' },
        { index: 1, releaseId: 'release-approval-1:1' },
      ],
      errors: [],
    });
  });

  it('creates only the kept positions and keeps going past a failure', async () => {
    const { service } = build({
      create: async (input) => {
        if (input.idempotencyKey === 'approval-1:2') {
          throw new BadRequestException('The scheduled time has passed.');
        }
        return { id: `rel-${String(input.idempotencyKey)}` };
      },
    });

    const result = await service.create(
      'org-1',
      'user-1',
      [
        { targets: ONE_CHANNEL, title: 'a' },
        { targets: ONE_CHANNEL, title: 'b' },
        { targets: ONE_CHANNEL, title: 'c' },
        { targets: ONE_CHANNEL, title: 'd' },
      ],
      { indexes: [0, 2, 3], keyBase: 'approval-1' },
    );

    expect(result.created).toEqual([
      { index: 0, releaseId: 'rel-approval-1:0' },
      { index: 3, releaseId: 'rel-approval-1:3' },
    ]);
    expect(result.errors).toEqual([
      { index: 2, message: 'The scheduled time has passed.' },
    ]);
  });

  it('names a release that is not an object', async () => {
    const { service } = build();

    const result = await service.create('org-1', 'user-1', ['nope'], {
      keyBase: 'k',
    });

    expect(result.errors).toEqual([
      { index: 0, message: 'Each release must be an object.' },
    ]);
  });
});

describe('PostGroupBatchService.describe', () => {
  it('shows each post as the reviewer reads it, slides in publishing order', async () => {
    const { service } = build({
      brands: [{ id: 'brand-1', label: 'Acme' }],
      credentials: [
        {
          brandId: 'brand-1',
          externalHandle: 'acme',
          externalName: 'Acme IG',
          id: 'cred-1',
        },
      ],
      ingredients: [
        { category: 'image', cdnUrl: 'https://cdn.example.com/a.jpg', id: 'a' },
        { category: 'image', cdnUrl: 'https://cdn.example.com/b.jpg', id: 'b' },
        { category: 'video', cdnUrl: 'https://cdn.example.com/c.mp4', id: 'c' },
      ],
    });

    const description = await service.describe('org-1', [
      {
        baseContent: 'Base text',
        brandId: 'brand-1',
        media: [
          { assetId: 'b', order: 1 },
          { assetId: 'a', order: 0 },
          { assetId: 'c', order: 2 },
        ],
        targets: [
          {
            caption: 'Channel text',
            credentialId: 'cred-1',
            platform: 'instagram',
            scheduledDate: '2026-11-15T08:00:00.000Z',
            timezone: 'Europe/Amsterdam',
          },
        ],
        title: 'Carousel',
      } satisfies Release,
    ]);

    expect(description.brandLabel).toBe('Acme');
    expect(description.brandIds).toEqual(['brand-1']);
    expect(description.posts).toEqual([
      {
        accountHandle: 'acme',
        accountLabel: 'Acme IG',
        error: null,
        index: 0,
        isRemoved: false,
        media: [
          { kind: 'image', order: 0, url: 'https://cdn.example.com/a.jpg' },
          { kind: 'image', order: 1, url: 'https://cdn.example.com/b.jpg' },
          { kind: 'video', order: 2, url: 'https://cdn.example.com/c.mp4' },
        ],
        platform: 'instagram',
        releaseId: null,
        scheduledAt: '2026-11-15T08:00:00.000Z',
        text: 'Channel text',
        timezone: 'Europe/Amsterdam',
        title: 'Carousel',
      },
    ]);
  });

  it('falls back to the release text and time when a target names none', async () => {
    const { service } = build();

    const { posts } = await service.describe('org-1', [
      {
        baseContent: 'Base text',
        scheduledDate: '2026-11-16T08:00:00.000Z',
        targets: [{ platform: 'twitter' }],
        title: 'Post',
      } satisfies Release,
    ]);

    expect(posts[0]).toMatchObject({
      accountHandle: null,
      media: [],
      scheduledAt: '2026-11-16T08:00:00.000Z',
      text: 'Base text',
    });
  });
});
