import type {
  AgentArtifactRecordKind,
  AgentArtifactReference,
} from '@genfeedai/interfaces';
import { AgentArtifactReferenceService } from '@genfeedai/server';
import { ConflictException, ForbiddenException } from '@nestjs/common';

vi.mock('@genfeedai/serializers', () => {
  const serializer = {
    serialize: vi.fn((record: { id?: string }) => ({
      data: { id: record.id },
    })),
  };
  return {
    ArticleSerializer: serializer,
    AssetSerializer: serializer,
    ContentDraftSerializer: serializer,
    IngredientSerializer: serializer,
    NewsletterSerializer: serializer,
    PostSerializer: serializer,
  };
});

const orgId = 'org-1';
const brandId = 'brand-1';
const userId = 'user-1';

function reference(
  kind: AgentArtifactRecordKind,
  recordId = `${kind}-1`,
): AgentArtifactReference {
  return {
    brandId,
    kind,
    organizationId: orgId,
    recordId,
    serializer: kind,
  } as AgentArtifactReference;
}

function createPrismaMock() {
  const delegate = () => ({
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  });
  return {
    agentMessage: delegate(),
    article: delegate(),
    asset: delegate(),
    brand: delegate(),
    contentDraft: delegate(),
    contentVersionPin: delegate(),
    ingredient: delegate(),
    member: delegate(),
    newsletter: delegate(),
    organization: delegate(),
    post: delegate(),
  };
}

describe('AgentArtifactReferenceService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AgentArtifactReferenceService;
  let logger: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createPrismaMock();
    logger = { log: vi.fn() };
    service = new AgentArtifactReferenceService(
      prisma as never,
      logger as never,
    );
  });

  it.each<{
    fixture: Record<string, unknown>;
    kind: AgentArtifactRecordKind;
  }>([
    {
      fixture: {
        brandId,
        id: 'article-1',
        organizationId: orgId,
        title: 'Article',
      },
      kind: 'article',
    },
    {
      fixture: {
        id: 'asset-1',
        parentBrandId: brandId,
        parentType: 'BRAND',
        sha256: 'asset-sha',
      },
      kind: 'asset',
    },
    {
      fixture: {
        brandId,
        content: 'Draft',
        id: 'content-draft-1',
        organizationId: orgId,
      },
      kind: 'content-draft',
    },
    {
      fixture: {
        brandId,
        id: 'ingredient-1',
        organizationId: orgId,
        sources: [],
        version: 3,
      },
      kind: 'ingredient',
    },
    {
      fixture: {
        brandId,
        content: 'Newsletter',
        id: 'newsletter-1',
        organizationId: orgId,
      },
      kind: 'newsletter',
    },
    {
      fixture: {
        brandId,
        description: 'Post',
        id: 'post-1',
        ingredients: [],
        organizationId: orgId,
      },
      kind: 'post',
    },
  ])('resolves and serializes an authorized $kind record', async ({
    fixture,
    kind,
  }) => {
    prisma[
      kind === 'content-draft' ? 'contentDraft' : kind
    ].findFirst.mockResolvedValue(fixture);
    if (kind === 'asset') {
      prisma.brand.findFirst.mockResolvedValue({
        id: brandId,
        organizationId: orgId,
      });
    }

    const result = await service.resolveReference(reference(kind), {
      brandId,
      organizationId: orgId,
    });

    expect(result).toMatchObject({
      reference: { kind, recordId: `${kind}-1` },
      serialized: { data: { id: `${kind}-1` } },
      source: 'canonical',
    });
  });

  it('rejects forged reference scope before returning the canonical record', async () => {
    prisma.post.findFirst.mockResolvedValue({
      brandId,
      id: 'post-1',
      ingredients: [],
      organizationId: orgId,
    });

    await expect(
      service.resolveReference(
        { ...reference('post'), brandId: 'brand-forged' },
        { brandId, organizationId: orgId },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an asset whose canonical parent identity is incomplete', async () => {
    prisma.asset.findFirst.mockResolvedValue({
      id: 'asset-1',
      parentType: 'INGREDIENT',
      sha256: 'asset-sha',
    });

    await expect(
      service.resolveReference(reference('asset'), {
        brandId,
        organizationId: orgId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.ingredient.findFirst).not.toHaveBeenCalled();
  });

  it('creates one immutable pin and reuses it for the same material state', async () => {
    const post = {
      brandId,
      credentialId: 'credential-1',
      description: 'Approved copy',
      id: 'post-1',
      ingredients: [{ id: 'ingredient-1' }],
      organizationId: orgId,
      platform: 'twitter',
      scheduledDate: new Date('2026-07-14T10:00:00.000Z'),
      targetSettings: { replyPolicy: 'mentions' },
    };
    prisma.member.findFirst.mockResolvedValue({ id: 'member-1' });
    prisma.post.findFirst.mockResolvedValue(post);
    prisma.contentVersionPin.findFirst
      .mockResolvedValueOnce(null)
      .mockImplementation(
        async ({ where }: { where: { idempotencyKey: string } }) => ({
          brandId,
          contentDigest: 'sha256:v1:placeholder',
          createdAt: new Date('2026-07-13T20:00:00.000Z'),
          createdByUserId: userId,
          id: 'pin-1',
          idempotencyKey: where.idempotencyKey,
          organizationId: orgId,
          provenance: {},
          recordId: 'post-1',
          recordKind: 'post',
          recordVersion: 'pin:pin-1',
        }),
      );
    prisma.contentVersionPin.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        createdAt: new Date('2026-07-13T20:00:00.000Z'),
      }),
    );

    const first = await service.createOrReuseVersionPin({
      createdByUserId: userId,
      reference: reference('post'),
    });
    const second = await service.createOrReuseVersionPin({
      createdByUserId: userId,
      reference: reference('post'),
    });

    expect(first.contentDigest).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(prisma.contentVersionPin.create).toHaveBeenCalledTimes(1);
  });

  it('creates the version pin through a caller-provided transaction', async () => {
    const transaction = createPrismaMock();
    transaction.member.findFirst.mockResolvedValue({ id: 'member-1' });
    transaction.post.findFirst.mockResolvedValue({
      brandId,
      description: 'Approved copy',
      id: 'post-1',
      ingredients: [],
      organizationId: orgId,
    });
    transaction.contentVersionPin.findFirst.mockResolvedValue(null);
    transaction.contentVersionPin.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        createdAt: new Date('2026-07-13T20:00:00.000Z'),
      }),
    );

    await service.createOrReuseVersionPin({
      createdByUserId: userId,
      reference: reference('post'),
      transaction,
    });

    expect(transaction.post.findFirst).toHaveBeenCalled();
    expect(transaction.contentVersionPin.create).toHaveBeenCalled();
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
    expect(prisma.contentVersionPin.create).not.toHaveBeenCalled();
  });

  it('fails closed when canonical post material changes after pinning', async () => {
    const original = {
      brandId,
      credentialId: 'credential-1',
      description: 'Approved copy',
      id: 'post-1',
      ingredients: [],
      organizationId: orgId,
      platform: 'twitter',
      targetSettings: {},
    };
    prisma.member.findFirst.mockResolvedValue({ id: 'member-1' });
    prisma.post.findFirst.mockResolvedValue(original);
    prisma.contentVersionPin.findFirst.mockResolvedValueOnce(null);
    prisma.contentVersionPin.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        createdAt: new Date('2026-07-13T20:00:00.000Z'),
      }),
    );
    const pin = await service.createOrReuseVersionPin({
      createdByUserId: userId,
      reference: reference('post'),
    });

    prisma.contentVersionPin.findFirst.mockResolvedValue({
      brandId,
      contentDigest: pin.contentDigest,
      createdAt: new Date(pin.createdAt),
      createdByUserId: userId,
      id: pin.id,
      idempotencyKey: pin.idempotencyKey,
      organizationId: orgId,
      provenance: {},
      recordId: 'post-1',
      recordKind: 'post',
      recordVersion: pin.recordVersion,
    });
    prisma.post.findFirst.mockResolvedValue({
      ...original,
      description: 'Mutated after approval',
    });

    await expect(
      service.assertVersionPinCurrent({
        pinId: pin.id,
        readContext: { brandId, organizationId: orgId },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'content_version_pin_mismatch',
      }),
    });
  });

  it('resolves only allowlisted canonical ids from an eligible legacy message', async () => {
    prisma.agentMessage.findFirst.mockResolvedValue({
      artifactReferences: [],
      id: 'message-1',
      isLegacyArtifactReferenceEligible: true,
      legacyArtifactReferenceReadCount: 0,
      metadata: {
        mediaUrl: 'https://cdn.example/untrusted.mp4',
        uiActions: [
          {
            contentId: 'ingredient-1',
            images: ['https://cdn.example/copied.png'],
            textContent: 'Copied presentation text',
          },
        ],
      },
    });
    prisma.agentMessage.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingredient.findFirst.mockResolvedValue({
      brandId,
      id: 'ingredient-1',
      organizationId: orgId,
      sources: [],
      version: 1,
    });

    const resolved = await service.resolveMessageReferences({
      messageId: 'message-1',
      readContext: { brandId, organizationId: orgId },
      telemetry: { client: 'web', deployment: 'saas' },
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].reference).toMatchObject({
      kind: 'ingredient',
      recordId: 'ingredient-1',
    });
    expect(logger.log).toHaveBeenCalledWith(
      'agent_artifact_reference_read',
      expect.objectContaining({
        client: 'web',
        deployment: 'saas',
        resolution: 'legacy-message',
      }),
    );
  });

  it('stops legacy compatibility after the bounded read limit', async () => {
    prisma.agentMessage.findFirst.mockResolvedValue({
      artifactReferences: [],
      id: 'message-1',
      isLegacyArtifactReferenceEligible: true,
      legacyArtifactReferenceReadCount: 20,
      metadata: {},
    });

    await expect(
      service.resolveMessageReferences({
        messageId: 'message-1',
        readContext: { organizationId: orgId },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
