import { Readable } from 'node:stream';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import {
  createExecutableActionNode,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));

const context = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};

const rectangle = {
  height: 0.5,
  id: 'a',
  kind: 'rectangle',
  width: 0.5,
  x: 0.25,
  y: 0.25,
};

function whiteImage(): Promise<Buffer> {
  return sharp({
    create: {
      background: { b: 255, g: 255, r: 255 },
      channels: 3,
      height: 100,
      width: 200,
    },
  })
    .png()
    .toBuffer();
}

async function harness(options: { isUploadFailing?: boolean } = {}) {
  const source = await whiteImage();
  const outputs: Array<{ id: string; status: string }> = [];
  const uploads: Buffer[] = [];
  const helper = {
    buildImageIngredientUrl: (id: string) => `https://cdn/images/${id}`,
    completeOutput: async (id: string) => {
      const output = outputs.find((entry) => entry.id === id);
      if (output) output.status = 'generated';
    },
    createWorkflowOutputIngredient: async () => {
      const id = `out-${outputs.length + 1}`;
      outputs.push({ id, status: 'processing' });
      return { ingredientId: id, metadataId: `meta-${id}` };
    },
    failOutput: async (id: string) => {
      const output = outputs.find((entry) => entry.id === id);
      if (output) output.status = 'failed';
    },
    patchMetadata: async () => undefined,
    readConfigString: (config: Record<string, unknown>, key: string) =>
      typeof config[key] === 'string' ? config[key] : undefined,
    requireMediaAsset: async (value: unknown, organizationId: string) => {
      if (organizationId !== 'org-1') {
        throw new Error('Library media asset not found');
      }
      return {
        brandId: 'brand-1',
        id: String(value),
        storageKey: `key-${String(value)}`,
        storageType: 'images',
      };
    },
    wrapEngineExecutor: (executor: unknown) => executor,
  } as unknown as WorkflowEngineExecutorHelperService;
  const files = {
    getFileFromS3: async () => Readable.from([source]),
    uploadToS3: async (_key: string, _type: string, data: { data: Buffer }) => {
      if (options.isUploadFailing) throw new Error('storage down');
      uploads.push(data.data);
      return { s3Key: 'ingredients/images/out-1' };
    },
  };
  const engine = new WorkflowEngine();
  new WorkflowMediaProcessingExecutorRegistrarService(
    helper,
    { isAuthorizedMediaDeliveryEnabled: false } as never,
    undefined,
    undefined,
    undefined,
    files as never,
  ).register(engine);

  const executor = engine.getExecutor('genfeedAction');
  const run = (
    annotations: unknown,
    runContext: typeof context = context,
    inputs: Map<string, unknown> = new Map([['image', 'image-1']]),
  ) =>
    executor?.(
      createExecutableActionNode({
        actionId: 'annotation',
        id: 'annotate-1',
        label: 'Annotate',
        parameters: { annotations },
      }),
      inputs,
      runContext,
    );
  return { outputs, run, uploads };
}

describe('annotation executor', () => {
  it('stores the annotated image as a new generated image of the same size', async () => {
    const { outputs, run, uploads } = await harness();

    const result = await run([rectangle]);

    expect(result).toEqual({
      id: 'out-1',
      image: 'https://cdn/images/out-1',
      status: 'GENERATED',
    });
    expect(outputs).toEqual([{ id: 'out-1', status: 'generated' }]);
    const stored = sharp(uploads[0]);
    expect(await stored.metadata()).toMatchObject({
      format: 'png',
      height: 100,
      width: 200,
    });
    const { data, info } = await stored
      .raw()
      .toBuffer({ resolveWithObject: true });
    const offset = (50 * info.width + 50) * info.channels;
    expect([data[offset], data[offset + 1], data[offset + 2]]).not.toEqual([
      255, 255, 255,
    ]);
  });

  it.each([
    [[], 'Add at least one annotation'],
    [[{ ...rectangle, x: 0.8 }], 'Fix the rectangle annotation (outsideImage)'],
  ])(
    'refuses annotations %j before creating any output',
    async (shapes, message) => {
      const { outputs, run } = await harness();

      await expect(run(shapes)).rejects.toThrow(message);
      expect(outputs).toEqual([]);
    },
  );

  it('refuses an image from another organization', async () => {
    const { outputs, run } = await harness();

    await expect(
      run([rectangle], { ...context, organizationId: 'org-2' }),
    ).rejects.toThrow('Library media asset not found');
    expect(outputs).toEqual([]);
  });

  it('marks the output failed when storage rejects the upload', async () => {
    const { outputs, run } = await harness({ isUploadFailing: true });

    await expect(run([rectangle])).rejects.toThrow('storage down');
    expect(outputs).toEqual([{ id: 'out-1', status: 'failed' }]);
  });
});
