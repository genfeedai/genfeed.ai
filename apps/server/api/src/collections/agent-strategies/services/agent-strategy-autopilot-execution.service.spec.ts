import { AgentStrategyAutopilotExecutionService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-execution.service';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';

// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.Post so
// `postsService.create`'s `normalizeData` resolves `category` as a genuine
// Prisma enum. Same pattern as `posts.service.spec.ts`.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

describe('AgentStrategyAutopilotExecutionService publishTextDraft (#5193)', () => {
  const strategy = {
    brandId: 'brand-1',
    id: 'strategy-1',
    organizationId: 'org-1',
  } as never;
  const draft = {
    contentRunId: null,
    id: 'draft-1',
    promptUsed: null,
    source: null,
    targetAttachments: [],
    targetSettings: {},
  } as never;

  function makeService(
    targets: readonly {
      caption: string;
      credentialId: string;
      platform: string;
    }[],
  ) {
    // `publishTextDraft` turns the draft itself into the *first* eligible
    // target's post (`patch`) and creates one post per sibling target
    // (`create`) — both need to resolve to a document with an id.
    const postPatch = vi.fn().mockResolvedValue({ id: 'draft-1-published' });
    const postCreate = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ id: `post-created-${postCreate.mock.calls.length}` }),
      );
    const postAccountFanoutService = {
      resolveTargets: vi.fn().mockResolvedValue(targets),
    };
    const postsService = { create: postCreate, patch: postPatch };
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    const service = new AgentStrategyAutopilotExecutionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      postsService as never,
      postAccountFanoutService as never,
      {} as never,
      logger as never,
    );
    vi.spyOn(
      service as unknown as {
        evaluateDraft: () => Promise<unknown>;
      },
      'evaluateDraft',
    ).mockResolvedValue({ decision: 'approved', reasons: [] });

    return { logger, postCreate, postPatch, service };
  }

  it('filters out a fanned-out platform that requires media before creating a text-only post for it', async () => {
    // TWITTER accepts caption-only content; YOUTUBE requires video media.
    // A text-only autopilot draft must not create a SCHEDULED YouTube post
    // that the channel contract (and, before it, the old worker-only check)
    // would reject.
    const { logger, postCreate, postPatch, service } = makeService([
      {
        caption: 'Hello world',
        credentialId: 'credential-twitter',
        platform: CredentialPlatform.TWITTER,
      },
      {
        caption: 'Hello world',
        credentialId: 'credential-youtube',
        platform: CredentialPlatform.YOUTUBE,
      },
    ]);

    const result = await (
      service as unknown as {
        publishTextDraft: (
          strategy: unknown,
          draft: unknown,
          content: string,
          platforms: string[],
          userId: string,
        ) => Promise<{ postIds: string[]; scheduled: boolean }>;
      }
    ).publishTextDraft(
      strategy,
      draft,
      'Hello world',
      [CredentialPlatform.TWITTER, CredentialPlatform.YOUTUBE],
      'user-1',
    );

    // Only the TWITTER target survives the filter, so the draft itself
    // (patched, not created) becomes that one post — YOUTUBE never reaches
    // `postsService` at all.
    expect(postCreate).not.toHaveBeenCalled();
    expect(postPatch).toHaveBeenCalledTimes(1);
    expect(postPatch).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        credentialId: 'credential-twitter',
        platform: CredentialPlatform.TWITTER,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    );
    expect(result.postIds).toEqual(['draft-1-published']);
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipped auto-publish targets requiring media',
      expect.objectContaining({ platforms: [CredentialPlatform.YOUTUBE] }),
    );
  });

  it('creates every target when all fanned-out platforms accept caption-only content', async () => {
    const { postCreate, postPatch, service } = makeService([
      {
        caption: 'Hello world',
        credentialId: 'credential-twitter',
        platform: CredentialPlatform.TWITTER,
      },
      {
        caption: 'Hello world',
        credentialId: 'credential-linkedin',
        platform: CredentialPlatform.LINKEDIN,
      },
    ]);

    const result = await (
      service as unknown as {
        publishTextDraft: (
          strategy: unknown,
          draft: unknown,
          content: string,
          platforms: string[],
          userId: string,
        ) => Promise<{ postIds: string[]; scheduled: boolean }>;
      }
    ).publishTextDraft(
      strategy,
      draft,
      'Hello world',
      [CredentialPlatform.TWITTER, CredentialPlatform.LINKEDIN],
      'user-1',
    );

    expect(postPatch).toHaveBeenCalledTimes(1);
    expect(postCreate).toHaveBeenCalledTimes(1);
    expect(result.postIds).toEqual(['draft-1-published', 'post-created-1']);
  });
});
