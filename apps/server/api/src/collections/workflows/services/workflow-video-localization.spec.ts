import { WorkflowMediaGenerationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import type {
  INodeExecutor,
  NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/services/generation-brief', () => ({
  runImageGenerationBrief: vi.fn(),
  runVideoGenerationBrief: vi.fn(),
  toRedactedGenerationBriefProviderData: vi.fn(),
  toRedactedVideoGenerationBriefProviderData: vi.fn(),
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));
vi.mock('@api/services/media-localization/media-localization.service', () => ({
  MediaLocalizationService: class {},
}));
vi.mock('@api/services/byok/byok.service', () => ({ ByokService: class {} }));
vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock(
  '@api/services/integrations/elevenlabs/services/elevenlabs.service',
  () => ({ ElevenLabsService: class {} }),
);
vi.mock(
  '@api/services/integrations/replicate/services/replicate.service',
  () => ({ ReplicateService: class {} }),
);
vi.mock('@api/services/prompt-builder/prompt-builder.service', () => ({
  PromptBuilderService: class {},
}));

type Arguments = ConstructorParameters<
  typeof WorkflowMediaGenerationExecutorRegistrarService
>;
const context = {
  organizationId: 'org-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
  runId: 'run-1',
};
describe('Text-to-speech workflow input ports', () => {
  it('passes connected language, voice, brand and speed to the real registrar resolver', async () => {
    const handlers = new Map<string, NodeExecutor>();
    const generateAndUploadAudio = vi.fn().mockResolvedValue({
      audioUrl: 'https://cdn.test/spanish.mp3',
      duration: 30,
      uploadResult: {},
    });
    const createWorkflowOutputIngredient = vi.fn().mockResolvedValue({
      ingredientId: 'generated-audio',
      metadataId: 'audio-metadata',
    });
    const helper = {
      requireBrandId: (value: string) => value,
      readConfigString: (config: Record<string, unknown>, key: string) =>
        config[key],
      createWorkflowOutputIngredient,
      patchMetadata: vi.fn(),
      patchIngredient: vi.fn(),
      buildMusicIngredientUrl: (id: string) => `https://api.test/musics/${id}`,
      wrapEngineExecutor:
        (executor: INodeExecutor): NodeExecutor =>
        async (node, inputs, ctx) =>
          (await executor.execute({ node, inputs, context: ctx })).data,
    };
    new WorkflowMediaGenerationExecutorRegistrarService(
      helper as unknown as Arguments[0],
      { log: vi.fn() } as unknown as Arguments[1],
      new WorkflowMediaProviderPlanService(
        helper as unknown as Arguments[0],
        { log: vi.fn() } as unknown as Arguments[1],
        personasServiceStub(),
        undefined,
        undefined,
      ),
      { generateAndUploadAudio } as unknown as Arguments[3],
    ).register({
      registerExecutor: (name: string, handler: NodeExecutor) =>
        handlers.set(name, handler),
    } as unknown as WorkflowEngine);
    const handler = handlers.get('textToSpeech');
    if (!handler) throw new Error('TTS handler not registered');
    await handler(
      {
        id: 'tts',
        type: 'textToSpeech',
        label: 'Speech',
        inputs: [],
        config: {
          voiceId: 'old-voice',
          language: 'en',
          brandId: 'old-brand',
          speed: 1,
        },
      },
      new Map<string, unknown>([
        ['text', 'Hola Genfeed'],
        ['voiceId', 'spanish-voice'],
        ['brandId', 'selected-brand'],
        ['language', 'es'],
        ['speed', 1.1],
      ]),
      context,
    );
    expect(createWorkflowOutputIngredient).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'selected-brand' }),
    );
    expect(generateAndUploadAudio).toHaveBeenCalledWith(
      'spanish-voice',
      'Hola Genfeed',
      'generated-audio',
      'org-1',
      'user-1',
      undefined,
      { languageCode: 'es', speed: 1.1 },
    );
  });
});
