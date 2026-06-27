import { type SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { type TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import { Injectable } from '@nestjs/common';

export type TaskRoutingDecision = Pick<
  TaskDocument,
  | 'chosenModel'
  | 'chosenProvider'
  | 'executionPathUsed'
  | 'outputType'
  | 'resultPreview'
  | 'reviewState'
  | 'reviewTriggered'
  | 'routingSummary'
  | 'skillVariantIds'
  | 'skillsUsed'
  | 'status'
>;

export type AiTaskIntent = {
  channel?: string;
  modality: 'image' | 'text' | 'video';
  outputType: TaskDocument['outputType'];
  workflowStage: 'creation';
};

type CreateTaskDtoExtended = CreateTaskDto & {
  brand?: string;
  organization?: string;
  outputType?: TaskDocument['outputType'];
  platforms?: string[];
  request?: string;
  user?: string;
};

type ExecutionPath = TaskRoutingDecision['executionPathUsed'];

/**
 * Ordered request-keyword → outputType inference table. The first pattern that
 * matches the (lower-cased) request wins; nothing matching falls through to
 * `ingredient`.
 */
const OUTPUT_TYPE_PATTERNS: ReadonlyArray<
  [RegExp, TaskDocument['outputType']]
> = [
  [/\b(video|reel|short|clip)\b/, 'video'],
  [/\b(newsletter|issue|beehiiv|email)\b/, 'newsletter'],
  [/\b(thread|tweet|post|reply|hook)\b/, 'post'],
  [/\b(caption|copy|text)\b/, 'caption'],
  [/\b(image|photo|thumbnail|visual)\b/, 'image'],
];

const EXECUTION_PATH_BY_OUTPUT_TYPE: Partial<
  Record<NonNullable<TaskDocument['outputType']>, ExecutionPath>
> = {
  caption: 'caption_generation',
  facecam: 'video_generation',
  image: 'image_generation',
  newsletter: 'caption_generation',
  post: 'caption_generation',
  video: 'video_generation',
};

function executionPathForOutputType(
  outputType: TaskDocument['outputType'],
): ExecutionPath {
  return (
    (outputType && EXECUTION_PATH_BY_OUTPUT_TYPE[outputType]) ??
    'agent_orchestrator'
  );
}

type FallbackConfig = {
  outputType: TaskDocument['outputType'];
  reviewTriggered: boolean;
  routingSummary: string;
  status: TaskRoutingDecision['status'];
};

/**
 * Per-outputType fallback routing config (used when no brand skill matches).
 * `executionPathUsed` is derived from {@link executionPathForOutputType} so it
 * never drifts from the skill-driven path.
 */
const FALLBACK_BY_OUTPUT_TYPE: Partial<
  Record<NonNullable<TaskDocument['outputType']>, FallbackConfig>
> = {
  caption: {
    outputType: 'caption',
    reviewTriggered: true,
    routingSummary:
      'Detected a writing request and routed it to the caption generation path for review.',
    status: 'backlog',
  },
  facecam: {
    outputType: 'facecam',
    reviewTriggered: false,
    routingSummary:
      'Detected a facecam video request and routed it to the video generation path.',
    status: 'in_progress',
  },
  image: {
    outputType: 'image',
    reviewTriggered: false,
    routingSummary:
      'Detected an image ingredient request and routed it to the image generation path.',
    status: 'in_progress',
  },
  newsletter: {
    outputType: 'newsletter',
    reviewTriggered: true,
    routingSummary:
      'Detected a newsletter request and routed it to the writing generation path for review.',
    status: 'backlog',
  },
  post: {
    outputType: 'post',
    reviewTriggered: true,
    routingSummary:
      'Detected a social post request and routed it to the writing generation path for review.',
    status: 'backlog',
  },
  video: {
    outputType: 'video',
    reviewTriggered: false,
    routingSummary:
      'Detected a short-form video request and routed it to the video generation path.',
    status: 'in_progress',
  },
};

const FALLBACK_DEFAULT: FallbackConfig = {
  outputType: 'ingredient',
  reviewTriggered: false,
  routingSummary:
    'Detected a broader ingredient request and routed it to the orchestration path.',
  status: 'backlog',
};

/**
 * Pure routing-decision engine for tasks. Resolves a request to an
 * outputType + execution path, preferring a matched brand skill and falling
 * back to keyword inference. Extracted out of `TasksService` so the
 * classification logic is testable in isolation and free of persistence.
 */
@Injectable()
export class TaskRoutingService {
  constructor(private readonly skillsService: SkillsService) {}

  async buildRoutingDecision(
    createDto: CreateTaskDto,
    taskTitle: string,
  ): Promise<TaskRoutingDecision> {
    const extended = createDto as CreateTaskDtoExtended;
    const inferredOutputType = this.inferOutputType(createDto);
    const taskIntent = this.buildTaskIntent(createDto, inferredOutputType);
    const brandId = extended.brand ?? undefined;
    const organizationId = extended.organization ?? undefined;

    if (brandId && organizationId) {
      const resolvedSkills = await this.skillsService.resolveBrandSkills(
        organizationId,
        brandId,
        {
          channel: taskIntent.channel,
          modality: taskIntent.modality,
          workflowStage: taskIntent.workflowStage,
        },
      );
      const matchedSkill = resolvedSkills[0];
      if (matchedSkill) {
        return this.buildSkillDrivenDecision(
          taskIntent,
          matchedSkill,
          taskTitle,
        );
      }
    }

    return this.buildFallbackRoutingDecision(inferredOutputType);
  }

  private buildTaskIntent(
    createDto: CreateTaskDto,
    outputType: TaskDocument['outputType'],
  ): AiTaskIntent {
    const extended = createDto as CreateTaskDtoExtended;
    const platforms = extended.platforms ?? [];
    const normalizedPlatforms = platforms.map((p) => p.toLowerCase());
    const primaryChannel = normalizedPlatforms[0];

    switch (outputType) {
      case 'image':
        return {
          channel: primaryChannel,
          modality: 'image',
          outputType: 'image',
          workflowStage: 'creation',
        };
      case 'video':
        return {
          channel: primaryChannel,
          modality: 'video',
          outputType: 'video',
          workflowStage: 'creation',
        };
      default:
        return {
          channel: primaryChannel,
          modality: 'text',
          outputType,
          workflowStage: 'creation',
        };
    }
  }

  private inferOutputType(
    createDto: CreateTaskDto,
  ): TaskDocument['outputType'] {
    const extended = createDto as CreateTaskDtoExtended;
    if (extended.outputType) {
      return extended.outputType;
    }

    const normalizedRequest = (extended.request ?? '').toLowerCase();
    const matched = OUTPUT_TYPE_PATTERNS.find(([pattern]) =>
      pattern.test(normalizedRequest),
    );
    return matched ? matched[1] : 'ingredient';
  }

  private buildSkillDrivenDecision(
    taskIntent: AiTaskIntent,
    matchedSkill: Awaited<
      ReturnType<SkillsService['resolveBrandSkills']>
    >[number],
    taskTitle: string,
  ): TaskRoutingDecision {
    const targetSkill = matchedSkill.targetSkill;
    const requiresApproval = this.skillRequiresApproval(targetSkill);
    const executionPathUsed = executionPathForOutputType(taskIntent.outputType);

    return {
      chosenModel: 'auto',
      chosenProvider: targetSkill.requiredProviders?.[0] ?? 'genfeed-router',
      executionPathUsed,
      outputType: taskIntent.outputType,
      resultPreview: requiresApproval
        ? `Prepared with ${targetSkill.name}: ${taskTitle}`
        : undefined,
      reviewState: requiresApproval ? 'pending_approval' : 'none',
      reviewTriggered: requiresApproval,
      routingSummary: `Resolved the request using the brand skill "${targetSkill.name}" (${targetSkill.slug}) for the ${taskIntent.workflowStage} stage.`,
      skillsUsed: targetSkill.slug ? [targetSkill.slug] : [],
      skillVariantIds: matchedSkill.variant?._id
        ? [String(matchedSkill.variant._id)]
        : [],
      status: requiresApproval
        ? 'in_review'
        : executionPathUsed === 'agent_orchestrator'
          ? 'backlog'
          : 'in_progress',
    };
  }

  private buildFallbackRoutingDecision(
    inferredOutputType: TaskDocument['outputType'],
  ): TaskRoutingDecision {
    const config =
      (inferredOutputType && FALLBACK_BY_OUTPUT_TYPE[inferredOutputType]) ??
      FALLBACK_DEFAULT;

    return {
      chosenModel: 'auto',
      chosenProvider: 'genfeed-router',
      executionPathUsed: executionPathForOutputType(config.outputType),
      outputType: config.outputType,
      reviewState: 'none',
      reviewTriggered: config.reviewTriggered,
      routingSummary: config.routingSummary,
      skillsUsed: [],
      skillVariantIds: [],
      status: config.status,
    };
  }

  private skillRequiresApproval(skill: SkillDocument): boolean {
    const reviewDefaults = skill.reviewDefaults;
    if (!reviewDefaults) return skill.workflowStage === 'review';
    const requiresApproval = reviewDefaults['requiresApproval'];
    return typeof requiresApproval === 'boolean' ? requiresApproval : false;
  }
}
