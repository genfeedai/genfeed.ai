import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { AvatarTwinsService } from '@api/collections/avatar-twins/services/avatar-twins.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
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
import { ActivityKey, AvatarTwinStatus } from '@genfeedai/contracts';
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
  failReads = false;
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
    if (this.failReads)
      throw new Error('Reconnect your personal HeyGen account.');
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

/** Keeps what the service recorded, as the bell would receive it. */
class RecordedActivities {
  inputs: RecordActivityInput[] = [];

  async record(input: RecordActivityInput): Promise<void> {
    this.inputs.push(input);
  }
}

describe('Avatar twin enrollment (real Postgres)', () => {
  const schema = `twins_${randomUUID().replaceAll('-', '')}`;
  const alice = { organizationId: 'alpha', userId: 'alice' };
  const bob = { organizationId: 'bravo', userId: 'bob' };
  const carol = { organizationId: 'alpha', userId: 'carol' };
  let sql: Client;
  let prisma: PrismaClient;
  let provider: FakeHeyGenTwins;
  let activities: RecordedActivities;
  let service: AvatarTwinsService;

  const startInput = (key: string) => ({
    idempotencyKey: key,
    name: 'My Digital Twin',
    sourceIngredientId: 'take-1',
  });

  // Stored files go to a scratch folder, so deleting the take is observable.
  const storageRoot = mkdtempSync(join(tmpdir(), 'twin-storage-'));
  const storedFile = (key: string) => join(storageRoot, key);
  const store = (key: string) => {
    mkdirSync(dirname(storedFile(key)), { recursive: true });
    writeFileSync(storedFile(key), 'take');
  };

  beforeAll(async () => {
    process.env.GENFEED_CLOUD = 'false';
    process.env.GENFEED_STORAGE_PATH = storageRoot;
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
        { handle: 'carol', id: 'carol' },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: 'alpha', label: 'Alpha', slug: 'alpha', userId: 'alice' },
        { id: 'bravo', label: 'Bravo', slug: 'bravo', userId: 'bob' },
      ],
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
    await prisma.ingredient.update({
      data: { isDeleted: false },
      where: { id: 'take-1' },
    });
    provider = new FakeHeyGenTwins();
    activities = new RecordedActivities();
    service = new AvatarTwinsService(
      prisma.$extends(
        createMediaUrlExtension({ cdnUrl: 'https://cdn.example.com' }),
      ) as unknown as PrismaService,
      provider as unknown as HeyGenTwinService,
      {
        get: (key: string) =>
          key === 'GENFEEDAI_APP_URL' ? 'https://app.example.com' : undefined,
      } as unknown as ConfigService,
      {
        error: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
      activities as unknown as ActivityRecorderService,
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
      service.start(bob, startInput('key-00000004')),
    ).rejects.toThrow("Recording with identifier 'take-1' not found");
  });

  it('refuses a teammate’s recording in the same organization', async () => {
    await expect(
      service.start(carol, startInput('key-00000008')),
    ).rejects.toThrow("Recording with identifier 'take-1' not found");
    expect(provider.uploads).toBe(0);
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
  it('deletes the stored recording once HeyGen has it, unless kept', async () => {
    store('ingredients/videos/take-1.webm');
    store('delivery/take-1-720.mp4');
    await prisma.mediaDeliveryVariant.create({
      data: {
        ingredientId: 'take-1',
        organizationId: 'alpha',
        policyVersion: 1,
        purpose: 'playback',
        sourceIdentity: 'take-1',
        sourceKey: 'ingredients/videos/take-1.webm',
        sourceVersion: 1,
        storageKey: 'delivery/take-1-720.mp4',
      },
    });

    await service.start(alice, startInput('key-00000009'));

    expect(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: 'take-1' } }))
        .isDeleted,
    ).toBe(true);
    expect(existsSync(storedFile('ingredients/videos/take-1.webm'))).toBe(
      false,
    );
    expect(existsSync(storedFile('delivery/take-1-720.mp4'))).toBe(false);

    await prisma.ingredient.update({
      data: { isDeleted: false },
      where: { id: 'take-1' },
    });
    store('ingredients/videos/take-1.webm');
    await service.start(alice, {
      ...startInput('key-00000010'),
      isRecordingKept: true,
    });
    expect(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: 'take-1' } }))
        .isDeleted,
    ).toBe(false);
    expect(existsSync(storedFile('ingredients/videos/take-1.webm'))).toBe(true);
  });

  it('keeps the recording when HeyGen never received it', async () => {
    provider.failUpload = true;

    await expect(
      service.start(alice, startInput('key-00000011')),
    ).rejects.toThrow('HeyGen is unavailable.');
    expect(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: 'take-1' } }))
        .isDeleted,
    ).toBe(false);
  });

  it('clears brand and organization defaults that point at a deleted twin', async () => {
    const twin = await service.start(alice, startInput('key-00000012'));
    const twinLook = { lookId: 'look_1', ownership: 'private' };
    const twinVoice = {
      externalVoiceId: 'voice_1',
      provider: 'HEYGEN',
      source: 'catalog',
    };
    // Same id as the twin's voice, but another provider's: not the twin's.
    const otherVoice = {
      externalVoiceId: 'voice_1',
      provider: 'ELEVENLABS',
      source: 'catalog',
    };
    await prisma.brand.createMany({
      data: [
        {
          agentConfig: {
            defaultAvatarRef: twinLook,
            defaultVoiceRef: twinVoice,
            heygenAvatarId: 'grp_1',
            heygenVoiceId: 'voice_1',
            persona: 'kept',
          },
          id: 'brand-twin',
          label: 'Twin brand',
          organizationId: 'alpha',
          slug: 'twin-brand',
          userId: 'alice',
        },
        {
          agentConfig: { defaultVoiceRef: otherVoice },
          id: 'brand-other',
          label: 'Other brand',
          organizationId: 'alpha',
          slug: 'other-brand',
          userId: 'alice',
        },
      ],
    });
    await prisma.organizationSetting.create({
      data: {
        defaultAvatarRef: twinLook,
        defaultVoiceRef: otherVoice,
        organizationId: 'alpha',
      },
    });

    await service.remove(alice, twin.id);

    const brands = await prisma.brand.findMany({
      orderBy: { id: 'asc' },
      select: { agentConfig: true, id: true },
    });
    expect(brands).toEqual([
      { agentConfig: { defaultVoiceRef: otherVoice }, id: 'brand-other' },
      {
        agentConfig: {
          defaultAvatarRef: null,
          defaultVoiceRef: null,
          heygenAvatarId: null,
          heygenVoiceId: null,
          persona: 'kept',
        },
        id: 'brand-twin',
      },
    ]);
    expect(
      await prisma.organizationSetting.findUnique({
        select: { defaultAvatarRef: true, defaultVoiceRef: true },
        where: { organizationId: 'alpha' },
      }),
    ).toEqual({ defaultAvatarRef: null, defaultVoiceRef: otherVoice });
  });
  it('tells the person once when their twin becomes ready', async () => {
    const twin = await service.start(alice, startInput('key-00000020'));
    provider.lookStatus = 'completed';
    provider.consent = 'accepted';

    await service.refresh(alice, twin.id);
    await service.refresh(alice, twin.id);

    expect(activities.inputs).toHaveLength(1);
    expect(activities.inputs[0]).toMatchObject({
      entityId: twin.id,
      key: ActivityKey.AVATAR_TWIN_TRAINING_COMPLETED,
      organizationId: 'alpha',
      userId: 'alice',
      value:
        "“My Digital Twin” is ready. Use it in a video or as a brand's default avatar.",
    });
    expect(activities.inputs[0].alert?.payload).toMatchObject({
      kind: 'avatar_twin',
      status: AvatarTwinStatus.READY,
      twinId: twin.id,
      version: 1,
    });
  });

  it('tells the person why consent was declined', async () => {
    const twin = await service.start(alice, startInput('key-00000021'));
    provider.lookStatus = 'completed';
    provider.consent = 'rejected';

    await service.refresh(alice, twin.id);

    expect(activities.inputs.map((input) => [input.key, input.value])).toEqual([
      [
        ActivityKey.AVATAR_TWIN_TRAINING_FAILED,
        'HeyGen declined the consent for “My Digital Twin”. Say the statement on camera. Ask for a new consent link and try again.',
      ],
    ]);
  });

  it('settles a waiting twin in the background once it is due', async () => {
    const twin = await service.start(alice, startInput('key-00000022'));
    provider.lookStatus = 'completed';
    provider.consent = 'accepted';
    const inOneMinute = new Date(Date.now() + 60 * 1000);
    const inThreeMinutes = new Date(Date.now() + 3 * 60 * 1000);

    expect(await service.trackWaiting(inOneMinute)).toEqual({
      checked: 0,
      failed: 0,
      interrupted: 0,
    });
    expect((await service.get(alice, twin.id)).status).toBe(
      AvatarTwinStatus.TRAINING,
    );

    expect(await service.trackWaiting(inThreeMinutes)).toEqual({
      checked: 1,
      failed: 0,
      interrupted: 0,
    });
    expect((await service.get(alice, twin.id)).status).toBe(
      AvatarTwinStatus.READY,
    );
    expect(activities.inputs.map((input) => input.key)).toEqual([
      ActivityKey.AVATAR_TWIN_TRAINING_COMPLETED,
    ]);
  });

  it('waits for the next check when the provider cannot be read', async () => {
    const twin = await service.start(alice, startInput('key-00000023'));
    provider.failReads = true;
    const inThreeMinutes = new Date(Date.now() + 3 * 60 * 1000);

    expect(await service.trackWaiting(inThreeMinutes)).toEqual({
      checked: 1,
      failed: 1,
      interrupted: 0,
    });
    expect(await service.get(alice, twin.id)).toMatchObject({
      lastCheckedAt: inThreeMinutes,
      status: AvatarTwinStatus.TRAINING,
    });
    expect(activities.inputs).toEqual([]);
  });

  it('fails an upload that never reached HeyGen and says so', async () => {
    const stuck = await prisma.avatarTwin.create({
      data: {
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        idempotencyKey: 'key-00000024',
        name: 'Stuck take',
        organizationId: 'alpha',
        status: AvatarTwinStatus.UPLOADING,
        userId: 'alice',
      },
    });

    expect((await service.trackWaiting()).interrupted).toBe(1);
    expect(await service.get(alice, stuck.id)).toMatchObject({
      failureCode: 'submission_interrupted',
      status: AvatarTwinStatus.FAILED,
    });
    expect(activities.inputs.map((input) => input.key)).toEqual([
      ActivityKey.AVATAR_TWIN_TRAINING_FAILED,
    ]);
  });
});
