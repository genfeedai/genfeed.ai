import { createPost } from '@api/collections/posts/handlers/post-create.handler';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';

describe('createPost draft boundary', () => {
  const identity = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as Parameters<typeof createPost>[0]['identity'];
  function setup() {
    const mocks = {
      accountHealthService: { evaluateScheduledPublishGate: vi.fn() },
      activitiesService: { create: vi.fn() },
      credentialsService: { findOne: vi.fn().mockResolvedValue(null) },
      ingredientsService: { findByIds: vi.fn() },
      loggerService: { error: vi.fn() },
      postsService: {
        create: vi.fn().mockResolvedValue({ id: 'post-1' }),
        handleYoutubePost: vi.fn(),
      },
      quotaService: { verifyQuota: vi.fn() },
    };
    const dependencies = mocks as unknown as Parameters<
      typeof createPost
    >[0]['dependencies'];
    return { mocks, dependencies };
  }
  const draft = {
    platform: CredentialPlatform.TWITTER,
    description: 'A draft',
    ingredients: [],
    label: '',
    targetExecutionState: TargetExecutionState.DRAFT,
  };
  it('saves an account-free draft in the active brand', async () => {
    const { mocks, dependencies } = setup();
    await createPost({ createPostDto: draft, dependencies, identity });
    expect(mocks.postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'twitter',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    expect(mocks.credentialsService.findOne).not.toHaveBeenCalled();
    expect(mocks.quotaService.verifyQuota).not.toHaveBeenCalled();
  });
  it.each([
    TargetExecutionState.SCHEDULED,
    TargetExecutionState.PUBLISHING,
    TargetExecutionState.PUBLISHED,
  ])('rejects account-free %s', async (targetExecutionState) => {
    const { mocks, dependencies } = setup();
    await expect(
      createPost({
        createPostDto: { ...draft, targetExecutionState },
        dependencies,
        identity,
      }),
    ).rejects.toThrow('Connect an account');
    expect(mocks.postsService.create).not.toHaveBeenCalled();
  });
  it('rejects a foreign or missing requested credential', async () => {
    const { mocks, dependencies } = setup();
    await expect(
      createPost({
        createPostDto: { ...draft, credentialId: 'foreign' },
        dependencies,
        identity,
      }),
    ).rejects.toThrow();
    expect(mocks.credentialsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        brandId: 'brand-1',
        isDeleted: false,
      }),
    );
    expect(mocks.postsService.create).not.toHaveBeenCalled();
  });
  it('does not start an upload for a YouTube draft', async () => {
    const { mocks, dependencies } = setup();
    await createPost({
      createPostDto: { ...draft, platform: CredentialPlatform.YOUTUBE },
      dependencies,
      identity,
    });
    expect(mocks.postsService.handleYoutubePost).not.toHaveBeenCalled();
  });
});
