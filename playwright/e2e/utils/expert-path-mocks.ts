import {
  BrandInterviewStatus,
  ContentPlanItemStatus,
  ContentPlanItemType,
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionPolicy,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import {
  EXPERT_FIRST_SYSTEM_CREDIT_COST,
  EXPERT_POSITIONING_DIMENSIONS,
} from '@genfeedai/contracts/constants';
import type {
  IBrandInterviewAnswerResult,
  IBrandInterviewQuestion,
  IBrandInterviewStep,
  IExpertPathStatus,
  IExpertPositioningScore,
} from '@genfeedai/contracts/interfaces';
import type { Page, Route } from '@playwright/test';

/**
 * Expert Path API mocks for the onboarding journey
 * (`brand → positioning → corpus → first-system`).
 *
 * Every handler is registered by RegExp so one registration covers both the
 * `api.genfeed.ai` host baked into nightly E2E builds and the local
 * `genfeed.localhost:3010` endpoint. The state object is per page, so a spec
 * that walks the journey cannot leak a scored interview into the next test.
 *
 * @module expert-path-mocks
 */

export const EXPERT_BRAND_ID = 'brand-1';
export const EXPERT_INTERVIEW_ID = 'expert-interview-e2e';
export const EXPERT_PLAN_ID = 'expert-plan-e2e';

/** Weeks of content the mocked generator returns; the API returns seven. */
const FIRST_SYSTEM_ITEM_COUNT = 3;

const EXPERT_QUESTIONS: readonly IBrandInterviewQuestion[] = [
  {
    answerType: 'text',
    examples: ['I ran growth at a Series B fintech for six years.'],
    fieldKey: 'originStory',
    group: 'expert',
    hint: 'Where does your authority actually come from?',
    isRequired: true,
    questionText: 'What did you do before this that earned you the right?',
    weight: 2,
  },
  {
    answerType: 'text',
    examples: ['Pipeline is a distribution problem, not a headcount problem.'],
    fieldKey: 'bigDomino',
    group: 'expert',
    isRequired: true,
    questionText: 'What is the one belief a client must accept to hire you?',
    weight: 2,
  },
];

export interface ExpertCorpusSourceState {
  id: string;
  title: string;
  /** Reads remaining before the source flips to READY, mimicking ingestion. */
  pendingReads: number;
}

export interface ExpertPathMockState {
  corpusSources: ExpertCorpusSourceState[];
  isInterviewComplete: boolean;
  isScored: boolean;
  /** Review outcome per plan item id; unreviewed items stay pending. */
  itemStatuses: Record<string, ContentPlanItemStatus>;
  questionIndex: number;
  planItemTopics: string[];
}

export function createExpertPathMockState(): ExpertPathMockState {
  return {
    corpusSources: [],
    isInterviewComplete: false,
    isScored: false,
    itemStatuses: {},
    planItemTopics: [],
    questionIndex: 0,
  };
}

// ----------------------------------------------------------------------------
// Payload builders
// ----------------------------------------------------------------------------

function buildPositioningScore(): IExpertPositioningScore {
  const dimensions = EXPERT_POSITIONING_DIMENSIONS.map((dimension, index) => {
    const score = index === EXPERT_POSITIONING_DIMENSIONS.length - 1 ? 4 : 8;
    return {
      followUpFieldKey: dimension.followUpFieldKey,
      followUpQuestion: dimension.followUpQuestion,
      key: dimension.key,
      label: dimension.label,
      maxWeightedScore: dimension.weight * 10,
      score,
      weight: dimension.weight,
      weightedScore: score * dimension.weight,
    };
  });

  return {
    dimensions,
    rating: 'good_foundation',
    scoredAt: '2026-03-10T10:00:00.000Z',
    totalScore: 76,
    version: 1,
    weakestDimension: dimensions[dimensions.length - 1].key,
  };
}

function buildInterviewSteps(
  state: ExpertPathMockState,
): IBrandInterviewStep[] {
  return EXPERT_QUESTIONS.map((question, index) => ({
    fieldKey: question.fieldKey,
    group: question.group,
    isNavigable: index <= state.questionIndex,
    label: question.questionText,
    question,
    status:
      index < state.questionIndex
        ? 'answered'
        : index === state.questionIndex
          ? 'current'
          : 'upcoming',
  }));
}

function buildAnswerResult(
  state: ExpertPathMockState,
  options: { isComplete: boolean },
): IBrandInterviewAnswerResult {
  const nextQuestion = EXPERT_QUESTIONS[state.questionIndex] ?? null;

  return {
    answeredFields: {},
    completenessScore: Math.min(100, state.questionIndex * 40),
    interviewId: EXPERT_INTERVIEW_ID,
    isComplete: options.isComplete,
    nextQuestion: options.isComplete ? null : nextQuestion,
    progress: {
      answeredFields: state.questionIndex,
      percentComplete: Math.round(
        (state.questionIndex / EXPERT_QUESTIONS.length) * 100,
      ),
      totalFields: EXPERT_QUESTIONS.length,
    },
    status: options.isComplete
      ? BrandInterviewStatus.COMPLETED
      : BrandInterviewStatus.IN_PROGRESS,
    steps: buildInterviewSteps(state),
    ...(options.isComplete
      ? { positioningScore: buildPositioningScore() }
      : {}),
  };
}

function buildExpertPathStatus(state: ExpertPathMockState): IExpertPathStatus {
  const readySourceCount = state.corpusSources.filter(
    (source) => source.pendingReads <= 0,
  ).length;
  const missing: ('positioning' | 'corpus')[] = [];
  if (!state.isScored) {
    missing.push('positioning');
  }
  if (readySourceCount === 0) {
    missing.push('corpus');
  }

  return {
    brandId: EXPERT_BRAND_ID,
    corpus: {
      isComplete: readySourceCount > 0,
      readySourceCount,
      sourceCount: state.corpusSources.length,
    },
    firstSystem: {
      readiness: {
        creditCost: EXPERT_FIRST_SYSTEM_CREDIT_COST,
        isReady: missing.length === 0,
        isUsingInterviewPlatforms: true,
        missing,
        platforms: ['linkedin'],
      },
      status: state.planItemTopics.length > 0 ? 'generated' : 'none',
      ...(state.planItemTopics.length > 0 ? { planId: EXPERT_PLAN_ID } : {}),
    },
    isExpert: true,
    positioning: {
      answeredCount: state.questionIndex,
      isComplete: state.isScored,
      totalCount: EXPERT_QUESTIONS.length,
      ...(state.isScored
        ? { harnessProfileId: 'expert-harness-profile-e2e' }
        : {}),
      ...(state.isScored ? { score: buildPositioningScore() } : {}),
    },
    publishApproval: { isRequired: true },
  };
}

function buildPlanItem(state: ExpertPathMockState, index: number) {
  const id = `expert-plan-item-${index + 1}`;

  return {
    attributes: {
      confidence: 0.8,
      id,
      planId: EXPERT_PLAN_ID,
      platforms: ['linkedin'],
      prompt: `Draft a post about ${state.planItemTopics[index]}`,
      status: state.itemStatuses[id] ?? ContentPlanItemStatus.PENDING,
      topic: state.planItemTopics[index],
      type: ContentPlanItemType.SKILL,
    },
    id,
    type: 'content-plan-items',
  };
}

function buildPlanDocument(state: ExpertPathMockState) {
  return {
    data: {
      attributes: {
        id: EXPERT_PLAN_ID,
        name: 'Expert Path first system',
        provenance: {
          connectToSchedulePlatforms: ['linkedin'],
          corpusSourceIds: state.corpusSources.map((source) => source.id),
        },
      },
      id: EXPERT_PLAN_ID,
      type: 'content-plans',
    },
  };
}

function buildItemsDocument(state: ExpertPathMockState) {
  return {
    data: state.planItemTopics.map((_topic, index) =>
      buildPlanItem(state, index),
    ),
    meta: { totalCount: state.planItemTopics.length },
  };
}

function buildKnowledgeSource(source: ExpertCorpusSourceState) {
  return {
    attributes: {
      brandId: EXPERT_BRAND_ID,
      id: source.id,
      isVisible: true,
      kind: KnowledgeSourceKind.URL,
      organizationId: 'mock-org-id-e2e-test',
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      referenceUrl: 'https://expert.example.com/keynote',
      scope: KnowledgeMemoryScope.BRAND,
      title: source.title,
    },
    id: source.id,
    type: 'knowledge-sources',
  };
}

function buildKnowledgeVersion(source: ExpertCorpusSourceState) {
  const versionId = `${source.id}-v1`;

  return {
    attributes: {
      contentHash: 'e2e-hash',
      id: versionId,
      isCurrent: true,
      observedAt: '2026-03-10T10:00:00.000Z',
      organizationId: 'mock-org-id-e2e-test',
      processingState:
        source.pendingReads > 0
          ? KnowledgeProcessingState.QUEUED
          : KnowledgeProcessingState.READY,
      retentionPolicy: KnowledgeRetentionPolicy.KEEP,
      retentionState: KnowledgeRetentionState.RETAINED,
      retrievalState: KnowledgeRetrievalState.ACTIVE,
      sourceId: source.id,
      version: 1,
    },
    id: versionId,
    type: 'knowledge-source-versions',
  };
}

// ----------------------------------------------------------------------------
// Route registration
// ----------------------------------------------------------------------------

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  });
}

/**
 * Register every Expert Path route the onboarding journey touches. Call it
 * AFTER the generic mocks: Playwright resolves handlers in reverse
 * registration order, so these must win over `/brands**` and the
 * knowledge-source catch-all.
 */
export async function setupExpertPathApiMocks(
  page: Page,
  state: ExpertPathMockState,
): Promise<void> {
  // --- Positioning interview ------------------------------------------------

  await page.route(
    /\/brands\/[^/?]+\/interview\/active(?:\?[^#]*)?$/,
    (route) =>
      state.isInterviewComplete
        ? fulfillJson(route, null)
        : route.fulfill({
            body: JSON.stringify({ message: 'No active interview' }),
            contentType: 'application/json',
            status: 404,
          }),
  );

  await page.route(
    /\/brands\/[^/?]+\/interview(?:\?[^#]*)?$/,
    async (route) => {
      await fulfillJson(route, {
        answeredFields: {},
        brandId: EXPERT_BRAND_ID,
        completenessScore: 0,
        creditsCharged: 0,
        currentQuestion: EXPERT_QUESTIONS[state.questionIndex] ?? null,
        interviewId: EXPERT_INTERVIEW_ID,
        isExpertPositioning: true,
        progress: {
          answeredFields: 0,
          percentComplete: 0,
          totalFields: EXPERT_QUESTIONS.length,
        },
        status: BrandInterviewStatus.IN_PROGRESS,
        steps: buildInterviewSteps(state),
      });
    },
  );

  await page.route(
    /\/brands\/interview\/[^/?]+\/(?:answer|skip)(?:\?[^#]*)?$/,
    async (route) => {
      state.questionIndex = Math.min(
        state.questionIndex + 1,
        EXPERT_QUESTIONS.length,
      );
      await fulfillJson(route, buildAnswerResult(state, { isComplete: false }));
    },
  );

  await page.route(
    /\/brands\/interview\/[^/?]+\/complete(?:\?[^#]*)?$/,
    async (route) => {
      state.isInterviewComplete = true;
      state.isScored = true;
      await fulfillJson(route, buildAnswerResult(state, { isComplete: true }));
    },
  );

  // --- Corpus ---------------------------------------------------------------

  await page.route(/\/knowledge-sources(?:\?[^#]*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      const source: ExpertCorpusSourceState = {
        // One QUEUED read first so the spec exercises the ingestion poll.
        id: `expert-corpus-${state.corpusSources.length + 1}`,
        pendingReads: 1,
        title: readCapturedTitle(route),
      };
      state.corpusSources.push(source);
      await fulfillJson(route, {
        data: buildKnowledgeSource(source),
        jobId: 'expert-corpus-job',
        versionId: `${source.id}-v1`,
      });
      return;
    }

    await fulfillJson(route, {
      data: state.corpusSources.map(buildKnowledgeSource),
      meta: { totalCount: state.corpusSources.length },
    });
  });

  await page.route(
    /\/knowledge-sources\/([^/?]+)\/versions(?:\?[^#]*)?$/,
    async (route) => {
      const sourceId = route
        .request()
        .url()
        .split('/knowledge-sources/')[1]
        ?.split('/')[0];
      const source = state.corpusSources.find(
        (candidate) => candidate.id === sourceId,
      );

      if (!source) {
        await fulfillJson(route, { data: [], meta: { totalCount: 0 } });
        return;
      }

      const document = {
        data: [buildKnowledgeVersion(source)],
        meta: { totalCount: 1 },
      };
      source.pendingReads = Math.max(0, source.pendingReads - 1);
      await fulfillJson(route, document);
    },
  );

  // --- Expert Path status and first system ---------------------------------

  await page.route(
    /\/brands\/[^/?]+\/expert-path(?:\?[^#]*)?$/,
    async (route) => {
      await fulfillJson(route, buildExpertPathStatus(state));
    },
  );

  await page.route(
    /\/expert-path\/positioning\/profile(?:\?[^#]*)?$/,
    async (route) => {
      state.isScored = true;
      await fulfillJson(route, {
        harnessProfileId: 'expert-harness-profile-e2e',
        score: buildPositioningScore(),
      });
    },
  );

  await page.route(
    /\/expert-path\/first-system(?:\?[^#]*)?$/,
    async (route) => {
      if (route.request().method() === 'POST') {
        state.planItemTopics = Array.from(
          { length: FIRST_SYSTEM_ITEM_COUNT },
          (_value, index) => `Expert topic ${index + 1}`,
        );
        await fulfillJson(route, {
          items: buildItemsDocument(state),
          plan: buildPlanDocument(state),
          provenance: {
            connectToSchedulePlatforms: ['linkedin'],
            corpusSourceIds: state.corpusSources.map((source) => source.id),
          },
        });
        return;
      }

      if (state.planItemTopics.length === 0) {
        await fulfillJson(route, { items: null, plan: null });
        return;
      }

      await fulfillJson(route, {
        items: buildItemsDocument(state),
        plan: buildPlanDocument(state),
      });
    },
  );

  await page.route(
    /\/expert-path\/first-system\/[^/?]+\/items\/[^/?]+(?:\?[^#]*)?$/,
    async (route) => {
      const itemId =
        route.request().url().split('/items/')[1]?.split('?')[0] ?? '';
      const index = state.planItemTopics.findIndex(
        (_topic, position) => `expert-plan-item-${position + 1}` === itemId,
      );
      const review = readItemReview(route);

      if (review.topic) {
        state.planItemTopics[index] = review.topic;
      }
      // Approving runs the content-engine workflow, so the item comes back
      // executing; rejecting skips it; editing leaves it pending for review.
      if (review.action === 'approve') {
        state.itemStatuses[itemId] = ContentPlanItemStatus.EXECUTING;
      } else if (review.action === 'reject') {
        state.itemStatuses[itemId] = ContentPlanItemStatus.SKIPPED;
      }

      await fulfillJson(route, {
        data: buildPlanItem(state, Math.max(0, index)),
      });
    },
  );
}

/** The review action (and optional topic edit) the item row submitted. */
function readItemReview(route: Route): { action: string; topic?: string } {
  try {
    const body = route.request().postDataJSON() as
      | { action?: string; topic?: string }
      | undefined;
    return {
      action: body?.action ?? 'approve',
      ...(body?.topic ? { topic: body.topic } : {}),
    };
  } catch {
    return { action: 'approve' };
  }
}

/** Title the corpus form submitted, falling back to the captured URL. */
function readCapturedTitle(route: Route): string {
  try {
    const body = route.request().postDataJSON() as
      | { referenceUrl?: string; title?: string }
      | undefined;
    return body?.title || body?.referenceUrl || 'Untitled source';
  } catch {
    return 'Untitled source';
  }
}
