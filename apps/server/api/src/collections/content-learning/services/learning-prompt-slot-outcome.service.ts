import type {
  LearningPromptSlotOutcomeGroup,
  LearningPromptSlotOutcomeQuery,
  LearningPromptSlotOutcomeReport,
} from '@api/collections/content-learning/interfaces/learning-prompt-slot-outcome.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  compareStructuredPromptSlots,
  hasStructuredPrompt,
  normalizeStructuredPrompt,
  type SlotOutcomeObservation,
} from '@genfeedai/harness';
import type { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

/** Newest posts read per report; the report says when this cut it short. */
export const LEARNING_PROMPT_SLOT_POST_LIMIT = 5000;

const slotPromptSelect = {
  action: true,
  blacklists: true,
  camera: true,
  cameraMovement: true,
  isDeleted: true,
  lens: true,
  lighting: true,
  mood: true,
  scene: true,
  sounds: true,
  speech: true,
  style: true,
  subject: true,
} satisfies Prisma.PromptSelect;

const slotOutcomePostSelect = {
  id: true,
  ingredientLinks: {
    orderBy: { position: 'asc' },
    select: {
      ingredient: {
        select: {
          category: true,
          isDeleted: true,
          prompt: { select: slotPromptSelect },
        },
      },
    },
    where: { ingredient: { isDeleted: false, promptId: { not: null } } },
  },
  learningDecision: {
    select: {
      rewards: {
        orderBy: { version: 'desc' },
        select: { composite: true, confidence: true, status: true },
        take: 1,
        where: { isDeleted: false },
      },
    },
  },
} satisfies Prisma.PostSelect;

export type LearningSlotOutcomePostRow = Prisma.PostGetPayload<{
  select: typeof slotOutcomePostSelect;
}>;

function rewardObjective(confidence: Prisma.JsonValue): string | null {
  if (
    !confidence ||
    typeof confidence !== 'object' ||
    Array.isArray(confidence)
  )
    return null;
  const { objective } = confidence;
  return typeof objective === 'string' && objective ? objective : null;
}

/**
 * One observation per post: its latest measured reward against the slots of
 * the first media prompt in the post (carousels contribute their lead slide).
 * Posts without a valid reward or without stored slots are counted, not guessed.
 */
export function buildLearningPromptSlotOutcomeReport(
  organizationId: string,
  posts: readonly LearningSlotOutcomePostRow[],
  isTruncated: boolean,
): LearningPromptSlotOutcomeReport {
  const skipped = { noPrompt: 0, noSlots: 0, noValidReward: 0 };
  const grouped = new Map<
    string,
    {
      category: string;
      objective: string;
      observations: SlotOutcomeObservation[];
    }
  >();

  for (const post of posts) {
    const reward = post.learningDecision?.rewards[0];
    const objective = reward ? rewardObjective(reward.confidence) : null;
    if (reward?.status !== 'valid' || reward.composite === null || !objective) {
      skipped.noValidReward += 1;
      continue;
    }
    const lead = post.ingredientLinks.find(
      (link) => link.ingredient.prompt && !link.ingredient.prompt.isDeleted,
    );
    if (!lead?.ingredient.prompt) {
      skipped.noPrompt += 1;
      continue;
    }
    const { blacklists, ...columns } = lead.ingredient.prompt;
    const slots = normalizeStructuredPrompt({ ...columns, avoid: blacklists });
    if (!hasStructuredPrompt(slots)) {
      skipped.noSlots += 1;
      continue;
    }
    const key = `${lead.ingredient.category}:${objective}`;
    const entry = grouped.get(key) ?? {
      category: lead.ingredient.category,
      objective,
      observations: [],
    };
    entry.observations.push({ reward: reward.composite, slots });
    grouped.set(key, entry);
  }

  const groups: LearningPromptSlotOutcomeGroup[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { category, objective, observations }]) => ({
      category,
      objective,
      postCount: observations.length,
      comparison: compareStructuredPromptSlots(observations, {
        seed: `${organizationId}:${key}`,
      }),
    }));

  return {
    organizationId,
    postCount: posts.length,
    skipped,
    isTruncated,
    groups,
  };
}

/**
 * Read-only report of which structured prompt slots go with better or worse
 * measured outcomes on published media posts. It enrolls nobody and changes no
 * generation; the verdicts are correlational leads, not causes.
 */
@Injectable()
export class LearningPromptSlotOutcomeService {
  constructor(private readonly prisma: PrismaService) {}

  async report(
    query: LearningPromptSlotOutcomeQuery,
  ): Promise<LearningPromptSlotOutcomeReport> {
    const { organizationId, brandId, credentialId } = query;
    const rows = await this.prisma.post.findMany({
      orderBy: { id: 'desc' },
      select: slotOutcomePostSelect,
      take: LEARNING_PROMPT_SLOT_POST_LIMIT + 1,
      where: {
        isDeleted: false,
        organizationId,
        ...(brandId ? { brandId } : {}),
        ...(credentialId ? { credentialId } : {}),
        ingredientLinks: {
          some: { ingredient: { isDeleted: false, promptId: { not: null } } },
        },
        learningDecision: {
          is: { isDeleted: false, organizationId, synthetic: false },
        },
      },
    });
    const isTruncated = rows.length > LEARNING_PROMPT_SLOT_POST_LIMIT;
    return buildLearningPromptSlotOutcomeReport(
      organizationId,
      rows.slice(0, LEARNING_PROMPT_SLOT_POST_LIMIT),
      isTruncated,
    );
  }
}
