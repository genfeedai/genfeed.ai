import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AvatarTwinsService } from '@api/collections/avatar-twins/services/avatar-twins.service';
import type {
  HeyGenConsentLink,
  HeyGenConsentStatus,
  HeyGenTwinCreated,
  HeyGenTwinDeleteResult,
  HeyGenTwinGroup,
  HeyGenTwinLook,
  HeyGenTwinStatus,
} from '@api/services/integrations/heygen/helpers/heygen-twin';
import type { HeyGenTwinService } from '@api/services/integrations/heygen/services/heygen-twin.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AvatarTwinStatus } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { createMediaUrlExtension } from '@libs/prisma/media-url.extension';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

/**
 * A provider double that behaves like the real one: it holds the state of
 * each avatar group and answers reads from it. Tests move the provider's
 * state and assert what the enrollment stores and returns.
 */
class FakeHeyGenTwins {
  lookStatus: HeyGenTwinStatus = 'processing';
  consent: HeyGenConsentStatus | null = 'pending';
  failUpload = false;
  keptOnDelete: string[] = [];
  deleted: string[] = [];
  uploads = 0;

  async uploadFootage(): Promise<{ assetId: string }> {
    if (this.failUpload) throw new Error('HeyGen is unavailable.');
    this.uploads += 1;
    return { assetId: `asset_${this.uploads}` };
  }

  async createTwin(): Promise<HeyGenTwinCreated> {
    return { group: this.group(), look: this.look() };
  }

  async getLook(): Promise<HeyGenTwinLook> {
    return this.look();
  }

  async getGroup(): Promise<HeyGenTwinGroup> {
    return this.group();
  }

  async requestConsentLink(): Promise<HeyGenConsentLink> {
    this.consent = 'pending';
    return {
      consentUrl: 'https://app.heygen.com/consent/abc',
      expiresAt: new Date('2026-11-09T12:00:00.000Z'),
      group: this.group(),
    };
  }

  async deleteTwin(
    _organizationId: string,
    input: { assetIds: string[]; groupId: string; voiceIds: string[] },
  ): Promise<HeyGenTwinDeleteResult> {
    const resources = [
      `avatar:${input.groupId}`,
      ...input.assetIds.map((id) => `asset:${id}`),
      ...input.voiceIds.map((id) => `voice:${id}`),
    ];
    const failed = resources.filter((r) => this.keptOnDelete.includes(r));
    this.deleted.push(...resources.filter((r) => !failed.includes(r)));
    return {
      deleted: resources.filter((r) => !failed.includes(r)),
      failed: failed.map((resource) => ({ reason: 'kept', resource })),
    };
  }

  private look(): HeyGenTwinLook {
    return {
      avatarType: 'digital_twin',
      defaultVoiceId: 'voice_1',
      errorCode: this.lookStatus === 'failed' ? 'training_failed' : null,
      errorMessage: this.lookStatus === 'failed' ? 'Face not visible.' : null,
      groupId: 'grp_1',
      lookId: 'look_1',
      previewImageUrl: 'https://files.heygen.ai/look_1.png',
      status: this.lookStatus,
      supportedEngines: ['avatar_iv', 'avatar_v'],
    };
  }

  private group(): HeyGenTwinGroup {
    return {
      consentStatus: this.consent,
      defaultVoiceId: 'voice_1',
      errorCode: this.consent === 'rejected' ? 'moderation_failed' : null,
      errorMessage:
        this.consent === 'rejected' ? 'Say the statement on camera.' : null,
      groupId: 'grp_1',
      looksCount: 1,
      status: this.consent === 'rejected' ? 'failed' : 'pending_consent',
    };
  }
}

describe('Avatar twin enrollment (real Postgres)', () => {
  const schema = `twins_${randomUUID().replaceAll('-', '')}`;
  const alice = { organizationId: 'alpha', userId: 'alice' };
  const bob = { organizationId: 'bravo', userId: 'bob' };
  let sql: Client;
  let prisma: PrismaClient;
  let provider: FakeHeyGenTwins;
  let service: AvatarTwinsService;

  const startInput = (key: string) => ({
    brandId: 'alpha-brand',
    idempotencyKey: key,
    name: 'My Digital Twin',
    sourceIngredientId: 'take-1',
  });

  beforeAll(async () => {
    const connectionString = assertIsolatedDatabaseUrl();
    sql = new Client({ connectionString });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}", public`);
    const ddl = execFileSync(
      'bunx',
      [
        'prisma',
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema',
        resolve('../../../packages/prisma/prisma/schema.prisma'),
        '--script',
      ],
      {
        cwd: resolve('../../../packages/prisma'),
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    expect(ddl).toContain('avatar_twins');
    await sql.query(
      ddl
        .replaceAll('"public".', '')
        .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, ''),
    );
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema }),
    });
    await prisma.user.createMany({
      data: [
        { handle: 'alice', id: 'alice' },
        { handle: 'bob', id: 'bob' },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: 'alpha', label: 'Alpha', slug: 'alpha', userId: 'alice' },
        { id: 'bravo', label: 'Bravo', slug: 'bravo', userId: 'bob' },
      ],
    });
    await prisma.brand.create({
      data: {
        id: 'alpha-brand',
        label: 'Alpha Brand',
        organizationId: 'alpha',
        slug: 'alpha-brand',
        userId: 'alice',
      },
    });
    const metadata = await prisma.metadata.create({
      data: { extension: 'WEBM', label: 'take', size: 5_000_000 },
    });
    await prisma.ingredient.create({
      data: {
        category: 'VIDEO',
        id: 'take-1',
        metadataId: metadata.id,
        organizationId: 'alpha',
        s3Key: 'ingredients/videos/take-1.webm',
        userId: 'alice',
      },
    });
  }, 120_000);

  beforeEach(async () => {
    await prisma.avatarTwin.deleteMany({});
    provider = new FakeHeyGenTwins();
    service = new AvatarTwinsService(
      prisma.$extends(
        createMediaUrlExtension({ cdnUrl: 'https://cdn.example.com' }),
      ) as unknown as PrismaService,
      provider as unknown as HeyGenTwinService,
      {
        get: (key: string) =>
          key === 'GENFEEDAI_APP_URL' ? 'https://app.example.com' : undefined,
      } as unknown as ConfigService,
      { error: () => undefined } as unknown as LoggerService,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql?.end();
  });

  it('starts training once per idempotency key', async () => {
    const first = await service.start(alice, startInput('key-00000001'));
    const second = await service.start(alice, startInput('key-00000001'));

    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({
      brandId: 'alpha-brand',
      providerAssetIds: ['asset_1'],
      providerGroupId: 'grp_1',
      providerLookId: 'look_1',
      status: AvatarTwinStatus.TRAINING,
      supportedEngines: ['avatar_iv', 'avatar_v'],
      voiceId: 'voice_1',
    });
    expect(await prisma.avatarTwin.count()).toBe(1);
  });

  it('walks training, rejected consent and a new link to ready', async () => {
    const twin = await service.start(alice, startInput('key-00000002'));

    provider.lookStatus = 'completed';
    expect((await service.refresh(alice, twin.id)).status).toBe(
      AvatarTwinStatus.AWAITING_CONSENT,
    );

    provider.consent = 'rejected';
    expect(await service.refresh(alice, twin.id)).toMatchObject({
      failureMessage: 'Say the statement on camera.',
      status: AvatarTwinStatus.CONSENT_REJECTED,
    });

    const link = await service.requestConsentLink(alice, twin.id, '/a/b');
    expect(link.consentUrl).toBe('https://app.heygen.com/consent/abc');
    expect(await service.get(alice, twin.id)).toMatchObject({
      consentLinkExpiresAt: new Date('2026-11-09T12:00:00.000Z'),
      failureMessage: null,
      status: AvatarTwinStatus.AWAITING_CONSENT,
    });

    provider.consent = 'accepted';
    const ready = await service.refresh(alice, twin.id);
    expect(ready.status).toBe(AvatarTwinStatus.READY);
    expect(ready.readyAt).toBeInstanceOf(Date);
  });

  it('records a failed submission with the reason', async () => {
    provider.failUpload = true;

    await expect(
      service.start(alice, startInput('key-00000003')),
    ).rejects.toThrow('HeyGen is unavailable.');
    const [stored] = await service.list(alice);
    expect(stored).toMatchObject({
      failureMessage: 'HeyGen is unavailable.',
      status: AvatarTwinStatus.FAILED,
    });
  });

  it('refuses a recording from another organization', async () => {
    await expect(
      service.start(bob, { ...startInput('key-00000004'), brandId: undefined }),
    ).rejects.toThrow("Recording with identifier 'take-1' not found");
  });

  it('keeps one organization out of another one’s twin', async () => {
    const twin = await service.start(alice, startInput('key-00000005'));

    await expect(service.get(bob, twin.id)).rejects.toThrow('not found');
    await expect(service.refresh(bob, twin.id)).rejects.toThrow('not found');
    await expect(service.remove(bob, twin.id)).rejects.toThrow('not found');
    expect(await service.list(bob)).toEqual([]);
  });

  it('deletes everything at the provider before hiding the twin', async () => {
    const twin = await service.start(alice, startInput('key-00000006'));

    await service.remove(alice, twin.id);

    expect(provider.deleted).toEqual([
      'avatar:grp_1',
      'asset:asset_1',
      'voice:voice_1',
    ]);
    expect(await service.list(alice)).toEqual([]);
  });

  it('keeps the twin when the provider could not delete everything', async () => {
    const twin = await service.start(alice, startInput('key-00000007'));
    provider.keptOnDelete = ['voice:voice_1'];

    await expect(service.remove(alice, twin.id)).rejects.toThrow(
      'voice:voice_1',
    );
    expect((await service.get(alice, twin.id)).id).toBe(twin.id);
  });
});
