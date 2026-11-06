import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { PersonasService } from '@api/collections/personas/services/personas.service';
import { VideoExtensionExecutionService } from '@api/collections/videos/services/video-extension-execution.service';
import { PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID } from '@api/collections/workflows/services/playground-extend-workflow-definition';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import { beforeEach, describe, expect, it } from 'vitest';

const sourceHash = 'a'.repeat(64);
const frameHash = 'b'.repeat(64);

type IngredientRow = Record<string, unknown> & { id: string };
type StoredObject = {
  assetHash: string;
  durationSeconds: number;
  sizeBytes: number;
};
type Execution = {
  frameStatusAtEnqueue: unknown;
  input: Record<string, unknown>;
  options: unknown;
};
type Where = Record<string, unknown>;

const matches = (row: IngredientRow, where: Where) =>
  Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && 'in' in expected) {
      return (expected as { in: unknown[] }).in.includes(row[key]);
    }
    return row[key] === expected;
  });

describe('video continuation execution preparation', () => {
  let executions: Execution[];
  let ingredients: Map<string, IngredientRow>;
  // When true, the frame finalizer reports success but stores no object.
  let isFrameObjectLost: boolean;
  let isFrameProcessingDown: boolean;
  let objects: Map<string, StoredObject>;
  // Runs after the source probe, before the second fingerprint.
  let onProbe: (() => void) | undefined;
  let revoked: Set<string>;
  let thumbnails: string[];
  let service: VideoExtensionExecutionService;

  const user = {
    apiKeyId: 'key',
    id: 'actor',
    isApiKey: true,
    organizationId: 'org',
    scopes: ['videos:create'],
    userId: 'actor',
  } as AuthenticatedUser;
  const urlFor = (key: string) => `https://stored/${key}`;
  const objectAt = (url: string) => {
    const object = objects.get(url.replace('https://stored/', ''));
    if (!object) {
      throw new Error(`no object at ${url}`);
    }
    return object;
  };
  const run = () =>
    service.enqueue(user, 'source', {
      duration: 8,
      model: 'google/veo-3.1',
      prompt: 'Continue forward',
    });

  beforeEach(() => {
    executions = [];
    ingredients = new Map([
      [
        'source',
        {
          brandId: 'brand',
          category: IngredientCategory.VIDEO,
          id: 'source',
          isDeleted: false,
          organizationId: 'org',
          s3Key: 'videos/source.mp4',
          status: IngredientStatus.GENERATED,
        },
      ],
    ]);
    isFrameObjectLost = false;
    isFrameProcessingDown = false;
    objects = new Map([
      [
        'videos/source.mp4',
        { assetHash: sourceHash, durationSeconds: 5, sizeBytes: 100 },
      ],
    ]);
    onProbe = undefined;
    revoked = new Set();
    thumbnails = [];

    service = new VideoExtensionExecutionService(
      {
        ingredient: {
          findFirst: async ({ where }: { where: Where }) =>
            [...ingredients.values()].find((row) => matches(row, where)) ??
            null,
          updateMany: async ({
            data,
            where,
          }: {
            data: Record<string, unknown>;
            where: Where;
          }) => {
            const hits = [...ingredients.values()].filter((row) =>
              matches(row, where),
            );
            for (const row of hits) {
              Object.assign(row, data);
            }
            return { count: hits.length };
          },
        },
        model: {
          findFirst: async () => ({
            endpoint: 'google/veo-3.1',
            key: 'google/veo-3.1',
            provider: 'replicate',
          }),
        },
      } as unknown as PrismaService,
      {
        assert: async () => {
          if (revoked.has('brand')) {
            throw new Error('Access revoked');
          }
        },
      } as unknown as BrandAccessService,
      {
        resolveCharacterReferences: async () => {
          if (revoked.has('character')) {
            throw new Error('Access revoked');
          }
        },
      } as unknown as PersonasService,
      {
        fingerprintMedia: async (url: string) => {
          const { assetHash, sizeBytes } = objectAt(url);
          return { assetHash, sizeBytes };
        },
        generateThumbnail: async (url: string) => {
          thumbnails.push(url);
          return 'https://stored/thumbnail';
        },
        getPresignedDownloadUrlForObjectKey: async (key: string) => urlFor(key),
        probeMediaFromUrl: async (url: string) => {
          const { durationSeconds, sizeBytes } = objectAt(url);
          onProbe?.();
          return { durationSeconds, sizeBytes };
        },
      } as unknown as FilesClientService,
      {
        createMediaDocumentsInternal: async (
          input: Record<string, unknown>,
        ) => {
          ingredients.set('frame', { ...input, id: 'frame', isDeleted: false });
          return { ingredientData: { id: 'frame' } };
        },
      } as unknown as SharedService,
      {
        processMediaForIngredient: async (id: string) => {
          if (isFrameProcessingDown) {
            throw new Error('frame upload failed');
          }
          const frame = ingredients.get(id) as IngredientRow;
          frame.status = IngredientStatus.GENERATED;
          if (!isFrameObjectLost) {
            frame.s3Key = 'images/frame.jpg';
            objects.set('images/frame.jpg', {
              assetHash: frameHash,
              durationSeconds: 0,
              sizeBytes: 10,
            });
          }
        },
      } as unknown as WebhooksService,
      { ingredientsEndpoint: 'https://assets' } as unknown as ConfigService,
      {
        enqueueWorkflow: async (
          input: Record<string, unknown>,
          options: unknown,
        ) => {
          executions.push({
            frameStatusAtEnqueue: ingredients.get('frame')?.status,
            input,
            options,
          });
          return { executionId: 'execution', status: 'PENDING' };
        },
      } as unknown as SystemWorkflowRunnerService,
    );
  });

  it('persists and finalizes an independent last-frame asset before queuing the canonical graph', async () => {
    await expect(run()).resolves.toMatchObject({ executionId: 'execution' });

    expect(ingredients.get('frame')).toMatchObject({
      brandId: 'brand',
      category: IngredientCategory.IMAGE,
      organizationId: 'org',
      parentId: 'source',
      s3Key: 'images/frame.jpg',
      sourceIds: ['source'],
      status: IngredientStatus.GENERATED,
      userId: 'actor',
    });
    expect(executions).toEqual([
      {
        // The frame is finalized before the graph is queued.
        frameStatusAtEnqueue: IngredientStatus.GENERATED,
        input: expect.objectContaining({
          actorScopes: ['videos:create'],
          apiKeyId: 'key',
          canonicalId: PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID,
          inputValues: expect.objectContaining({
            frameIngredientId: 'frame',
            image: 'https://assets/images/frame',
            parentIngredientId: 'source',
            sourceEvidence: expect.objectContaining({
              frame: expect.objectContaining({
                assetId: 'frame',
                sourceVersion: frameHash,
              }),
              sourceVersion: sourceHash,
            }),
            sourceVideo: { video: 'https://assets/videos/source' },
          }),
        }),
        options: { dispatchClass: 'interactive' },
      },
    ]);
  });

  it.each(['brand', 'character'])(
    'refuses revoked %s access before files or output effects',
    async (kind) => {
      revoked.add(kind);

      await expect(run()).rejects.toThrow('Access revoked');
      expect(thumbnails).toEqual([]);
      expect(ingredients.has('frame')).toBe(false);
      expect(executions).toEqual([]);
    },
  );

  it('refuses bytes that change during probing without creating a frame or execution', async () => {
    onProbe = () => {
      objects.set('videos/source.mp4', {
        assetHash: frameHash,
        durationSeconds: 5,
        sizeBytes: 100,
      });
    };

    await expect(run()).rejects.toThrow('source changed');
    expect(ingredients.has('frame')).toBe(false);
    expect(executions).toEqual([]);
  });

  it('never dispatches when the last frame has no persisted storage object', async () => {
    isFrameObjectLost = true;

    await expect(run()).rejects.toThrow('last frame has not been stored');
    expect(executions).toEqual([]);
  });

  it('marks the last frame failed and dispatches nothing when finalizing it fails', async () => {
    isFrameProcessingDown = true;

    await expect(run()).rejects.toThrow('frame upload failed');
    expect(ingredients.get('frame')?.status).toBe(IngredientStatus.FAILED);
    expect(executions).toEqual([]);
  });
});
