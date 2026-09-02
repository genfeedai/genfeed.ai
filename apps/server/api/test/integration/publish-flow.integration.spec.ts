/**
 * Real-backend proof of the credential-connect -> publish path (#334).
 *
 * Scope is deliberately narrow: this does NOT drive BullMQ, the
 * `CronPostsService` scheduler, or the workers publish processor. It
 * exercises the two in-process seams that make up the publish flow:
 *
 *  1. Connect: the REAL `CredentialsService.create()` (backed by the real
 *     `CredentialCryptoService`) persists a Ghost credential with its API
 *     key encrypted at rest, read back through a REAL Postgres
 *     `PrismaService` (via `E2ETestModule.forRoot`).
 *  2. Publish: the REAL `GhostPublisherService.publish()` is invoked
 *     directly against a real, seeded draft `Post` row, with only the
 *     outbound `GhostService` (the Ghost Admin API client) DI-mocked. The
 *     resulting `Post` state transition is then applied via the REAL
 *     `PostsService.patch()`, mirroring `CronPostsService`'s success path
 *     (`targetExecutionState: published` + visibility, not leftover
 *     `Post.status`), and read back from Postgres.
 */

// Allow skipping this file when the Prisma DB is not available
// Set SKIP_PRISMA_DB=true to skip all tests in this file
const describeWithDatabase =
  process.env.SKIP_PRISMA_DB === 'true' ? describe.skip : describe;

// This spec overrides ConfigService with a REAL instance (see the `providers`
// array below) so CredentialCryptoService/GhostPublisherService get real
// getters instead of the default mocked `.get()` shim. That means the real
// Joi schema validates on construction — `PORT` is the only unconditionally
// required var the e2e-api CI job's env block doesn't already set
// (DATABASE_URL/REDIS_URL/etc. are set there). Must be set before the first
// service import triggers module evaluation. `??=` so a real CI/dev PORT
// always wins.
process.env.PORT ??= '3010';

// Both `CredentialCryptoService` (real path, used by `CredentialsService.create()`)
// and the static `EncryptionUtil` facade (used internally by `GhostPublisherService`)
// resolve the symmetric cipher key from this env var. It must be set before either
// is constructed so values written by one path decrypt correctly via the other.
process.env.TOKEN_ENCRYPTION_KEY ??= 'test-encryption-key-for-publish-flow-e2e';

import type { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createTestBrand,
  createTestOrganization,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import type { TestDatabaseHelper } from '@api-test/e2e-test.module';
import {
  createTestDatabaseHelper,
  E2ETestModule,
} from '@api-test/e2e-test.module';
import {
  CredentialPlatform,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Test, type TestingModule } from '@nestjs/testing';

interface OrganizationBrandFixture {
  brandId: string;
  organizationId: string;
  userId: string;
}

const seedOrganizationBrandFixture = async (
  dbHelper: TestDatabaseHelper,
): Promise<OrganizationBrandFixture> => {
  const userId = generateIdString();
  const organizationId = generateIdString();
  const brandId = generateIdString();

  // Organization seeding ensures its canonical user dependency exists.
  await dbHelper.seedCollection('organizations', [
    createTestOrganization({ id: organizationId, userId }),
  ]);
  await dbHelper.seedCollection('brands', [
    createTestBrand({
      id: brandId,
      organizationId,
      userId,
    }),
  ]);

  return { brandId, organizationId, userId };
};

describeWithDatabase('Publish flow real-backend proof (#334)', () => {
  let moduleRef: TestingModule;
  let dbHelper: TestDatabaseHelper;
  let prisma: PrismaService;
  let credentialsService: CredentialsService;
  let postsService: PostsService;
  let ghostPublisherService: GhostPublisherService;
  let ghostServiceMock: { createPost: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    ghostServiceMock = { createPost: vi.fn() };

    const moduleConfig = await E2ETestModule.forRoot({
      controllers: [],
      providers: [
        CredentialsService,
        CredentialCryptoService,
        PostsService,
        GhostPublisherService,
        { provide: GhostService, useValue: ghostServiceMock },
        // The default mocked ConfigService only exposes `.get()`/`.getNumber()` —
        // CredentialCryptoService and GhostPublisherService's base class need the
        // real `.tokenEncryptionKey`/`.ingredientsEndpoint` getters, so this
        // spec's real instance overrides the default (last provider wins).
        { provide: ConfigService, useValue: new ConfigService() },
      ],
      useMockGuards: false,
    });

    moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();

    dbHelper = createTestDatabaseHelper(moduleRef);
    prisma = moduleRef.get(PrismaService);
    credentialsService = moduleRef.get(CredentialsService);
    postsService = moduleRef.get(PostsService);
    ghostPublisherService = moduleRef.get(GhostPublisherService);
  });

  afterAll(async () => {
    // Guard against a `beforeAll` throw leaving `moduleRef` unset — don't
    // let cleanup mask the real setup error with a second failure.
    await moduleRef?.close();
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();
    ghostServiceMock.createPost.mockReset();
  });

  it('connects a real Ghost credential with the API key encrypted at rest', async () => {
    const { userId, organizationId, brandId } =
      await seedOrganizationBrandFixture(dbHelper);
    const plaintextApiKey = 'ghost-admin-api-key:6465616462656566';

    const createDto: CreateCredentialDto = {
      accessToken: plaintextApiKey,
      accessTokenExpiry: new Date().toISOString(),
      accessTokenSecret: '',
      brandId,
      externalHandle: 'https://test-ghost-blog.example.com',
      externalId: 'ghost-site-e2e',
      isConnected: true,
      oauthToken: '',
      oauthTokenSecret: '',
      organizationId,
      platform: CredentialPlatform.GHOST,
      refreshToken: '',
      refreshTokenExpiry: new Date().toISOString(),
      userId,
    };

    const created = await credentialsService.create(createDto);

    const persisted = await prisma.credential.findFirst({
      where: { id: created.id },
    });

    expect(persisted).not.toBeNull();
    expect(persisted?.platform).toBe(
      toPrismaCredentialPlatform(CredentialPlatform.GHOST),
    );
    expect(persisted?.organizationId).toBe(organizationId);
    expect(persisted?.isDeleted).toBe(false);
    expect(persisted?.accessToken).toBeTruthy();
    // Encrypted at rest — the stored ciphertext must not equal the plaintext key.
    expect(persisted?.accessToken).not.toBe(plaintextApiKey);
    // The real CredentialCryptoService/EncryptionUtil cipher round-trips.
    expect(EncryptionUtil.decrypt(persisted?.accessToken as string)).toBe(
      plaintextApiKey,
    );
  });

  it('publishes a draft post through GhostPublisherService and transitions it to public', async () => {
    const { userId, organizationId, brandId } =
      await seedOrganizationBrandFixture(dbHelper);
    const plaintextApiKey = 'ghost-admin-api-key:6465616462656566';
    const ghostUrl = 'https://test-ghost-blog.example.com';
    const credentialId = generateIdString();
    const postId = generateIdString();

    await dbHelper.seedCollection('credentials', [
      {
        accessToken: EncryptionUtil.encrypt(plaintextApiKey),
        brandId,
        externalHandle: ghostUrl,
        externalId: 'ghost-site-e2e',
        id: credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId,
        platform: toPrismaCredentialPlatform(CredentialPlatform.GHOST),
        userId,
      },
    ]);

    await dbHelper.seedCollection('posts', [
      {
        brandId,
        credentialId,
        description: '<p>Real publish flow proof for #334.</p>',
        id: postId,
        label: 'Publish flow e2e test post',
        organizationId,
        platform: 'ghost',
        status: 'draft',
        targetExecutionState: TargetExecutionState.DRAFT,
        visibility: PostVisibility.PUBLIC,
        userId,
      },
    ]);

    const [rawPost, rawCredential, rawOrganization] = await Promise.all([
      prisma.post.findFirst({ where: { id: postId } }),
      prisma.credential.findFirst({ where: { id: credentialId } }),
      prisma.organization.findFirst({ where: { id: organizationId } }),
    ]);

    if (!rawPost || !rawCredential || !rawOrganization) {
      throw new Error('Publish flow fixture did not persist the expected rows');
    }

    ghostServiceMock.createPost.mockResolvedValueOnce({
      id: 'ghost-post-external-id',
      url: `${ghostUrl}/p/ghost-post-external-id`,
    });

    const context: PublishContext = {
      settings: {},
      brandId,
      credential: rawCredential as unknown as CredentialDocument,
      isDraft: false,
      organization: rawOrganization as unknown as OrganizationDocument,
      organizationId,
      post: new PostEntity(rawPost),
      postId,
    };

    const result = await ghostPublisherService.publish(context);

    expect(ghostServiceMock.createPost).toHaveBeenCalledTimes(1);
    expect(ghostServiceMock.createPost).toHaveBeenCalledWith(
      ghostUrl,
      plaintextApiKey,
      'Publish flow e2e test post',
      '<p>Real publish flow proof for #334.</p>',
      'published',
      undefined,
    );
    expect(result.success).toBe(true);
    expect(result.externalId).toBe('ghost-post-external-id');

    // Mirrors CronPostsService persistPublishState on immediate success —
    // driven here directly, without the cron/queue orchestration layer.
    // PostsService.patch ignores leftover `status`; canonical write is
    // targetExecutionState + visibility (#2642).
    await postsService.patch(postId, {
      externalId: result.externalId,
      externalShortcode: result.externalShortcode ?? undefined,
      publicationDate: new Date(),
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PUBLIC,
    });

    const publishedPost = await prisma.post.findFirst({
      where: { id: postId },
    });

    expect(publishedPost?.targetExecutionState).toBe(
      TargetExecutionState.PUBLISHED,
    );
    expect(publishedPost?.visibility).toBe(PostVisibility.PUBLIC);
    expect(publishedPost?.externalId).toBe('ghost-post-external-id');
    expect(publishedPost?.publicationDate).toBeInstanceOf(Date);

    const projected = await postsService.findOne({ id: postId });
    expect(projected?.status).toBe(PostStatus.PUBLIC);
  });
});
