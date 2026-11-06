import { createPost } from '@api/collections/posts/handlers/post-create.handler';
import {
  ActivityEntityModel,
  ActivityKey,
  CredentialPlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';

type Row = Record<string, unknown>;
type Dependencies = Parameters<typeof createPost>[0]['dependencies'];

const matches = (row: Row, where: Row) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

describe('createPost draft boundary', () => {
  const identity = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as Parameters<typeof createPost>[0]['identity'];

  let brands: Row[];
  let credentials: Row[];
  let posts: Row[];
  let activities: Row[];
  let youtubeUploads: unknown[];
  let quotaChecks: unknown[];
  let dependencies: Dependencies;

  beforeEach(() => {
    brands = [
      { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
      { id: 'brand-2', isDeleted: false, organizationId: 'org-1' },
      { id: 'brand-selected', isDeleted: false, organizationId: 'org-1' },
      { id: 'brand-foreign', isDeleted: false, organizationId: 'org-2' },
    ];
    credentials = [
      {
        brandId: 'brand-2',
        id: 'credential-2',
        isDeleted: false,
        organizationId: 'org-1',
        platform: 'TWITTER',
      },
      {
        brandId: 'brand-foreign',
        id: 'foreign',
        isDeleted: false,
        organizationId: 'org-2',
        platform: 'TWITTER',
      },
    ];
    posts = [];
    activities = [];
    youtubeUploads = [];
    quotaChecks = [];

    dependencies = {
      accountHealthService: {
        evaluateScheduledPublishGate: async () => undefined,
      },
      activityRecorder: {
        record: async (activity: Row) => {
          activities.push(activity);
        },
      },
      credentialsService: {
        findOne: async (where: Row) =>
          credentials.find((row) => matches(row, where)) ?? null,
      },
      ingredientsService: { findByIds: async () => [] },
      loggerService: { error: () => {} },
      postsService: {
        create: async (data: Row) => {
          const post = { ...data, id: `post-${posts.length + 1}` };
          posts.push(post);
          return post;
        },
        handleYoutubePost: async (...args: unknown[]) => {
          youtubeUploads.push(args);
        },
        prisma: {
          brand: {
            findFirst: async ({ where }: { where: Row }) =>
              brands.find((row) => matches(row, where)) ?? null,
          },
        },
      },
      quotaService: {
        verifyQuota: async (...args: unknown[]) => {
          quotaChecks.push(args);
        },
      },
    } as unknown as Dependencies;
  });

  const draft = {
    description: 'A draft',
    ingredients: [],
    label: '',
    platform: CredentialPlatform.TWITTER,
    targetExecutionState: TargetExecutionState.DRAFT,
  };

  it('uses the requested workspace brand over the last-used brand', async () => {
    await createPost({
      createPostDto: { ...draft, brandId: 'brand-selected' },
      dependencies,
      identity,
    });

    expect(posts).toEqual([
      expect.objectContaining({ brandId: 'brand-selected' }),
    ]);
  });

  it('refuses a requested brand from another organization', async () => {
    await expect(
      createPost({
        createPostDto: { ...draft, brandId: 'brand-foreign' },
        dependencies,
        identity,
      }),
    ).rejects.toThrow();
    expect(posts).toEqual([]);
  });

  it('saves an account-free draft in the active brand without a quota check', async () => {
    await createPost({ createPostDto: draft, dependencies, identity });

    expect(posts).toEqual([
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'twitter',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    ]);
    expect(quotaChecks).toEqual([]);
  });

  it('records a saved text draft as a created post, never a scheduled video', async () => {
    const post = await createPost({
      createPostDto: draft,
      dependencies,
      identity,
    });

    expect(post.id).toBe('post-1');
    expect(activities).toEqual([
      expect.objectContaining({
        entityId: 'post-1',
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_CREATED,
      }),
    ]);
    expect(youtubeUploads).toEqual([]);
  });

  it.each([
    TargetExecutionState.SCHEDULED,
    TargetExecutionState.PUBLISHING,
    TargetExecutionState.PUBLISHED,
  ])('rejects account-free %s', async (targetExecutionState) => {
    await expect(
      createPost({
        createPostDto: { ...draft, targetExecutionState },
        dependencies,
        identity,
      }),
    ).rejects.toThrow('Connect an account');
    expect(posts).toEqual([]);
  });

  it.each([
    ['another organization', 'foreign'],
    ['nowhere', 'missing'],
  ])('rejects a credential that lives in %s', async (_label, credentialId) => {
    await expect(
      createPost({
        createPostDto: { ...draft, brandId: 'brand-1', credentialId },
        dependencies,
        identity,
      }),
    ).rejects.toThrow();
    expect(posts).toEqual([]);
  });

  it('uses the credential owning brand when a legacy caller omits brandId', async () => {
    await createPost({
      createPostDto: { ...draft, credentialId: 'credential-2' },
      dependencies,
      identity,
    });

    expect(posts).toEqual([expect.objectContaining({ brandId: 'brand-2' })]);
  });

  it('does not start an upload for a YouTube draft', async () => {
    await createPost({
      createPostDto: { ...draft, platform: CredentialPlatform.YOUTUBE },
      dependencies,
      identity,
    });

    expect(posts).toHaveLength(1);
    expect(youtubeUploads).toEqual([]);
  });
});
