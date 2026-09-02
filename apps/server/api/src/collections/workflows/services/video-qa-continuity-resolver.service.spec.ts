import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';
import { VideoQaContinuityResolverService } from './video-qa-continuity-resolver.service';

function createHarness() {
  const llm = { chatCompletion: vi.fn() };
  const prisma = {
    model: { findMany: vi.fn() },
    organizationSetting: { findUnique: vi.fn() },
  };
  const service = new VideoQaContinuityResolverService(
    llm as unknown as LlmDispatcherService,
    prisma as unknown as PrismaService,
  );
  return { llm, prisma, service };
}

const input = {
  characterReferenceUrls: ['https://cdn.test/face.png'],
  contactSheetUrl: 'https://cdn.test/sheet.png',
  organizationId: 'org-1',
  productReferenceUrls: [],
  runId: 'run-1',
  videoUrl: 'https://cdn.test/video.mp4',
};

describe('VideoQaContinuityResolverService', () => {
  it('returns an observable skip when no enabled vision model exists', async () => {
    const { llm, prisma, service } = createHarness();
    prisma.organizationSetting.findUnique.mockResolvedValue({
      defaultModel: null,
      enabledModelIds: [],
    });
    prisma.model.findMany.mockResolvedValue([]);

    await expect(service.resolve(input)).resolves.toEqual({
      skipReason: 'vision_model_unavailable',
    });
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('uses the configured vision model and returns structured findings', async () => {
    const { llm, prisma, service } = createHarness();
    prisma.organizationSetting.findUnique.mockResolvedValue({
      defaultModel: 'openai/vision',
      enabledModelIds: ['model-1'],
    });
    prisma.model.findMany.mockResolvedValue([
      {
        capabilities: ['vision'],
        description: null,
        id: 'model-1',
        key: 'openai/vision',
        recommendedFor: [],
        supportsFeatures: [],
      },
    ]);
    llm.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              character: {
                confidence: 0.9,
                summary: 'Consistent.',
                verdict: 'consistent',
              },
              outfit: {
                confidence: 0.8,
                summary: 'Consistent.',
                verdict: 'consistent',
              },
              product: {
                confidence: null,
                summary: 'Not assessed.',
                verdict: 'not_assessed',
              },
            }),
          },
        },
      ],
    });

    await expect(service.resolve(input)).resolves.toEqual(
      expect.objectContaining({
        finding: expect.objectContaining({
          character: expect.objectContaining({ verdict: 'consistent' }),
          videoUrl: 'https://cdn.test/video.mp4',
        }),
        modelKey: 'openai/vision',
      }),
    );
  });
});
