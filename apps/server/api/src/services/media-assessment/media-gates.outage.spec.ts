import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import {
  MediaAssessmentService,
  toPolicyMediaAssessment,
} from '@api/services/media-assessment/media-assessment.service';
import { MediaVisionEvaluationService } from '@api/services/media-assessment/media-vision-evaluation.service';
import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import type { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import { MediaTextDecisionService } from '@api/services/media-text-decisions/media-text-decision.service';
import { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import { NullModerationProvider } from '@api/services/moderation/providers/null-moderation.provider';
import { NullTypedDecisionProvider } from '@api/services/typed-decisions/providers/null-typed-decision.provider';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import type { TypedDecisionProviderResolver } from '@api/services/typed-decisions/typed-decision-provider.resolver';
import { AgentPublishDecision, CredentialPlatform } from '@genfeedai/contracts';
import {
  AGENT_PUBLISH_POLICY_NAME,
  applyMediaAssessmentToPublishPolicy,
} from '@genfeedai/contracts/api-types/contracts/agent-publish-policy.contract';
import type {
  IMediaPerception,
  IModerationProvider,
  TypedDecisionProvider,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';

/**
 * Provider-outage matrix for the media gates (#4883).
 *
 * Every classifier gate runs `live` against two broken providers: `none` (no
 * adapter bound) and `timeout` (a stub whose every call times out). The
 * contract under test is the one the outage drill documents:
 * - no gate job persists a verdict, a flag or a decision it did not get;
 * - the publish-path assessment never calls a provider and never throws;
 * - media the gates could not check goes to review (`checks_pending`),
 *   never through and never to a rejection, and nothing changes in `shadow`.
 */

const JOB = { ingredientId: 'asset-1', organizationId: 'org-1' };
const HASH = 'e'.repeat(64);
const NOW = new Date('2026-09-26T10:00:00.000Z');
const LIVE_CONFIG = {
  MEDIA_GATE_VISION_MODE: 'live',
  MEDIA_TEXT_GATE_DECISION_MODE: 'live',
  MODERATION_MODE: 'live',
};

type Outage = 'none' | 'timeout';

function timeoutError(): Error {
  return Object.assign(new Error('The operation timed out.'), {
    name: 'TimeoutError',
  });
}

function rejectWithTimeout(): Promise<never> {
  return Promise.reject(timeoutError());
}

function moderationProvider(outage: Outage): IModerationProvider {
  if (outage === 'none') {
    return new NullModerationProvider();
  }
  return {
    classifyFrames: vi.fn(rejectWithTimeout),
    classifyImage: vi.fn(rejectWithTimeout),
    classifyText: vi.fn(rejectWithTimeout),
    isEnabled: true,
    name: 'openai',
  };
}

function decisionProvider(outage: Outage): TypedDecisionProvider {
  if (outage === 'none') {
    return new NullTypedDecisionProvider();
  }
  return {
    choose: vi.fn(rejectWithTimeout),
    decide: vi.fn(rejectWithTimeout),
    name: 'jev',
    score: vi.fn(rejectWithTimeout),
  };
}

function config(outage: Outage, overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    ...LIVE_CONFIG,
    MODERATION_PROVIDER: outage === 'none' ? 'none' : 'openai',
    OPENAI_API_KEY: outage === 'none' ? '' : 'test-openai-key',
    TYPED_DECISION_TIMEOUT_MS: 50,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function logger(): LoggerService {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function perception(): IMediaPerception {
  return {
    assetHash: HASH,
    createdAt: NOW.toISOString(),
    description: {
      brandElements: [],
      contentWarnings: [],
      hasPeople: true,
      hasSuspectedMinors: false,
      setting: 'kitchen',
      subjects: ['chef'],
      summary: 'A chef plates a dessert.',
      textOnScreen: '',
    },
    descriptionModel: 'vision-model',
    descriptionStatus: 'ready',
    diagnostics: [],
    durationSeconds: 12,
    frames: [0, 1, 2].map((index) => ({
      height: 100,
      index,
      storageKey: `k${index}`,
      timestampSeconds: index * 4,
      url: `https://cdn/f${index}.jpg`,
      width: 100,
    })),
    framesStatus: 'ready',
    id: 'perception-1',
    ingredientId: JOB.ingredientId,
    kind: 'video',
    ocr: [],
    ocrStatus: 'ready',
    organizationId: JOB.organizationId,
    reusedFromId: null,
    schemaVersion: 1,
    transcript: { durationSeconds: 12, language: 'en', text: 'Plating time.' },
    transcriptStatus: 'ready',
    updatedAt: NOW.toISOString(),
  } as IMediaPerception;
}

function perceptionService(): MediaPerceptionService {
  return {
    getForAsset: vi.fn().mockResolvedValue(perception()),
  } as unknown as MediaPerceptionService;
}

function perceptionRow() {
  const record = perception();
  return {
    ...record,
    attempts: 0,
    audioUrl: null,
    createdAt: NOW,
    frames: record.frames,
    updatedAt: NOW,
    visionEvaluationId: null,
  };
}

/** Every write a gate job could make, so a test can assert none happened. */
function writes() {
  return {
    activityCreate: vi.fn(),
    evaluationCreate: vi.fn(),
    moderationUpsert: vi.fn(),
    textUpsert: vi.fn(),
  };
}

describe.each<Outage>(['none', 'timeout'])(
  'media gates with the provider %s (#4883)',
  (outage) => {
    it('moderation persists no verdict and raises no activity', async () => {
      const w = writes();
      const service = new MediaModerationService(
        {
          ingredient: { findFirst: vi.fn().mockResolvedValue({ id: 'a' }) },
          mediaModeration: {
            findFirst: vi.fn().mockResolvedValue(null),
            upsert: w.moderationUpsert,
          },
        } as unknown as PrismaService,
        perceptionService(),
        moderationProvider(outage),
        { create: w.activityCreate } as unknown as ActivitiesService,
        config(outage),
        logger(),
      );

      const run = service.moderate(JOB);
      if (outage === 'none') {
        await expect(run).resolves.toBe('skipped');
      } else {
        // Thrown so BullMQ retries the job; the asset stays unchecked.
        await expect(run).rejects.toThrow(/timed out/);
      }
      expect(w.moderationUpsert).not.toHaveBeenCalled();
      expect(w.activityCreate).not.toHaveBeenCalled();
    });

    it('vision records the paid attempt and creates no evaluation', async () => {
      const w = writes();
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const service = new MediaVisionEvaluationService(
        {
          evaluation: { create: w.evaluationCreate },
          ingredient: {
            findFirst: vi.fn().mockResolvedValue({
              brandId: 'brand-1',
              category: 'VIDEO',
              organization: { userId: 'owner-1' },
              userId: 'user-1',
            }),
          },
          mediaPerception: {
            findFirst: vi
              .fn()
              .mockResolvedValueOnce({
                id: 'perception-1',
                visionAttempts: 0,
                visionEvaluationId: null,
              })
              .mockResolvedValueOnce(null),
            updateMany,
          },
        } as unknown as PrismaService,
        perceptionService(),
        {
          scoreVisionFrames: vi.fn(() =>
            outage === 'none'
              ? Promise.reject(new Error('No vision model is configured.'))
              : rejectWithTimeout(),
          ),
        } as unknown as ContentQualityScorerService,
        config(outage),
        logger(),
      );

      await expect(service.evaluate(JOB)).resolves.toBe('failed');
      expect(w.evaluationCreate).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { visionAttempts: { increment: 1 } },
        }),
      );
    });

    it('text decisions persist nothing they were not answered', async () => {
      const w = writes();
      const provider = decisionProvider(outage);
      const typedDecisions = new TypedDecisionService(
        {
          resolve: vi.fn(async () => provider),
        } as unknown as TypedDecisionProviderResolver,
        config(outage),
        logger(),
      );
      const service = new MediaTextDecisionService(
        {
          ingredient: {
            findFirst: vi.fn().mockResolvedValue({
              brand: { description: 'Pastry studio.', label: 'Crumb' },
              brandId: 'brand-1',
            }),
          },
          mediaTextDecision: {
            findFirst: vi.fn().mockResolvedValue(null),
            upsert: w.textUpsert,
          },
          post: {
            findMany: vi
              .fn()
              .mockResolvedValue([{ description: 'Dessert of the day' }]),
          },
        } as unknown as PrismaService,
        perceptionService(),
        typedDecisions,
        config(outage),
        logger(),
      );

      await expect(service.evaluate(JOB)).resolves.toBe('skipped');
      expect(w.textUpsert).not.toHaveBeenCalled();
    });

    describe('publish-path assessment', () => {
      function assessment(overrides: Record<string, unknown> = {}) {
        const provider = decisionProvider(outage);
        const moderation = moderationProvider(outage);
        const readiness = {
          evaluatePublishReadiness: vi.fn().mockResolvedValue({
            checkedAt: NOW.toISOString(),
            diagnostics: [],
            isBlocked: false,
          }),
        };
        const service = new MediaAssessmentService(
          {
            evaluation: { findMany: vi.fn().mockResolvedValue([]) },
            ingredient: {
              findMany: vi
                .fn()
                .mockResolvedValue([{ category: 'VIDEO', id: 'asset-1' }]),
            },
            mediaModeration: { findMany: vi.fn().mockResolvedValue([]) },
            mediaPerception: {
              findMany: vi.fn().mockResolvedValue([perceptionRow()]),
            },
            mediaTextDecision: { findMany: vi.fn().mockResolvedValue([]) },
          } as unknown as PrismaService,
          readiness as unknown as MediaReadinessService,
          config(outage, overrides),
          new TypedDecisionService(
            {
              resolve: vi.fn(async () => provider),
            } as unknown as TypedDecisionProviderResolver,
            config(outage, overrides),
            logger(),
          ),
        );
        return { moderation, provider, service };
      }

      const request = {
        assetIds: ['asset-1'],
        caption: 'Dessert of the day',
        organizationId: 'org-1',
        platforms: [CredentialPlatform.INSTAGRAM],
      };

      it('holds unchecked media for review without calling any provider', async () => {
        const { moderation, provider, service } = assessment();

        const result = await service.assessPublishMedia(request);

        expect(result.isBlocking).toBe(true);
        expect(result.reasons.map((reason) => reason.code)).toEqual([
          'perception:checks_pending',
        ]);
        if (outage === 'timeout') {
          expect(moderation.classifyText).not.toHaveBeenCalled();
          expect(provider.decide).not.toHaveBeenCalled();
        }

        const policy = applyMediaAssessmentToPublishPolicy(
          {
            decision: AgentPublishDecision.PERMITTED,
            policyName: AGENT_PUBLISH_POLICY_NAME,
            reason: 'Auto-publish is enabled.',
          },
          toPolicyMediaAssessment(result),
        );
        expect(policy.decision).toBe(AgentPublishDecision.DENIED);
        expect(policy.reason).toMatch(/^Media review required:/);
      });

      it('changes nothing while every gate is in shadow', async () => {
        const { service } = assessment({
          MEDIA_GATE_VISION_MODE: 'shadow',
          MEDIA_TEXT_GATE_DECISION_MODE: 'shadow',
          MODERATION_MODE: 'shadow',
        });

        await expect(service.assessPublishMedia(request)).resolves.toEqual({
          isBlocking: false,
          isPerceptionPending: false,
          reasons: [],
          warnings: [],
        });
      });
    });
  },
);
