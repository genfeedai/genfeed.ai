import type { MediaVisionEvaluationService } from '@api/services/media-assessment/media-vision-evaluation.service';
import type { MediaTextDecisionService } from '@api/services/media-text-decisions/media-text-decision.service';
import type { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import type { MediaModerationJobData } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { MediaModerationProcessor } from '@workers/processors/api/queues/media-moderation/media-moderation.processor';
import type { Job } from 'bullmq';

type Gate = 'moderation' | 'text' | 'vision';

const job = {
  data: { ingredientId: 'asset-1', organizationId: 'org-1' },
} as Job<MediaModerationJobData>;

/**
 * The processor with three gates that record the asset they checked, and a
 * logger that keeps the finished summary. `down` names a gate whose provider
 * is out.
 */
function processorWith(down?: Gate) {
  const checked: Array<[Gate, string]> = [];
  const summaries: Array<Record<string, unknown>> = [];
  const gate =
    (name: Gate, outcome: string) => async (data: MediaModerationJobData) => {
      checked.push([name, data.ingredientId]);
      if (name === down) {
        throw new Error(`${name} vendor down`);
      }
      return outcome;
    };
  const processor = new MediaModerationProcessor(
    {
      moderate: gate('moderation', 'classified'),
    } as unknown as MediaModerationService,
    {
      evaluate: gate('vision', 'evaluated'),
    } as unknown as MediaVisionEvaluationService,
    {
      evaluate: gate('text', 'decided'),
    } as unknown as MediaTextDecisionService,
    {
      log: (_message: string, summary: Record<string, unknown>) => {
        summaries.push(summary);
      },
    } as unknown as LoggerService,
  );
  return { checked, processor, summaries };
}

describe('MediaModerationProcessor', () => {
  it('runs every gate on the asset and logs their outcomes', async () => {
    const { checked, processor, summaries } = processorWith();

    await processor.process(job);

    expect(checked).toEqual([
      ['moderation', 'asset-1'],
      ['vision', 'asset-1'],
      ['text', 'asset-1'],
    ]);
    expect(summaries).toEqual([
      {
        ingredientId: 'asset-1',
        outcome: 'classified',
        textOutcome: 'decided',
        visionOutcome: 'evaluated',
      },
    ]);
  });

  it.each([
    [
      'moderation' as const,
      { outcome: 'error', textOutcome: 'decided', visionOutcome: 'evaluated' },
    ],
    [
      'vision' as const,
      { outcome: 'classified', textOutcome: 'decided', visionOutcome: 'error' },
    ],
    [
      'text' as const,
      {
        outcome: 'classified',
        textOutcome: 'error',
        visionOutcome: 'evaluated',
      },
    ],
  ])(
    'still runs the other gates when %s is down, then fails the job',
    async (down, outcomes) => {
      const { checked, processor, summaries } = processorWith(down);

      await expect(processor.process(job)).rejects.toThrow(
        `${down} vendor down`,
      );

      expect(checked.map(([name]) => name)).toEqual([
        'moderation',
        'vision',
        'text',
      ]);
      expect(summaries).toEqual([{ ingredientId: 'asset-1', ...outcomes }]);
    },
  );
});
