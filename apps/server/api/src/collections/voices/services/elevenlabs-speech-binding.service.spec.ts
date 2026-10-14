import type { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import {
  ElevenLabsSpeechBindingService,
  SPEECH_SUBMISSION_LEASE_MS,
} from '@api/collections/voices/services/elevenlabs-speech-binding.service';
import type { VoicesService } from '@api/collections/voices/services/voices.service';
import type { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { IngredientStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConflictException } from '@nestjs/common';

describe('ElevenLabsSpeechBindingService.claimSubmission', () => {
  const organizationId = testId('org');
  const ingredientId = testId('ingredient');
  const receipt = {
    connection: {
      credentialVersionId: 'platform',
      kind: 'platform' as const,
      organizationId,
      provider: 'elevenlabs' as const,
    },
    organizationId,
    provider: 'elevenlabs' as const,
    state: 'accepted' as const,
    version: 1 as const,
    voice: { externalVoiceId: 'voice-1' },
  };
  let updateMany: ReturnType<typeof vi.fn>;
  let findFirst: ReturnType<typeof vi.fn>;
  let service: ElevenLabsSpeechBindingService;

  const current = (submittedAt: string, overrides = {}) => ({
    generationProvider: { ...receipt, state: 'submitted', submittedAt },
    s3Key: null,
    status: IngredientStatus.PROCESSING,
    ...overrides,
  });

  beforeEach(() => {
    updateMany = vi.fn().mockResolvedValue({ count: 0 });
    findFirst = vi.fn().mockResolvedValue(null);
    service = new ElevenLabsSpeechBindingService(
      {} as ElevenLabsAccountVoicesService,
      {} as ElevenLabsConnectionService,
      {
        prisma: { ingredient: { findFirst, updateMany } },
      } as unknown as VoicesService,
    );
  });

  it('claims an accepted request and stamps the submission time', async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.claimSubmission(ingredientId, receipt, true),
    ).resolves.toBe('claimed');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          generationProvider: expect.objectContaining({
            state: 'submitted',
            submittedAt: expect.any(String),
          }),
        },
      }),
    );
  });

  it('reports a fresh claim on processing audio as in flight', async () => {
    findFirst.mockResolvedValue(current(new Date().toISOString()));

    await expect(
      service.claimSubmission(ingredientId, receipt, true),
    ).resolves.toBe('in-flight');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ingredientId, isDeleted: false, organizationId },
      }),
    );
  });

  it.each([
    [
      'an expired lease',
      current(
        new Date(Date.now() - SPEECH_SUBMISSION_LEASE_MS - 1000).toISOString(),
      ),
    ],
    [
      'a claim without a timestamp',
      {
        generationProvider: { ...receipt, state: 'submitted' },
        s3Key: null,
        status: IngredientStatus.PROCESSING,
      },
    ],
    [
      'a failed asset',
      current(new Date().toISOString(), { status: IngredientStatus.FAILED }),
    ],
  ])('treats %s as an unknown result', async (_label, row) => {
    findFirst.mockResolvedValue(row);

    await expect(
      service.claimSubmission(ingredientId, receipt, true),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
