import { type SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import {
  TASK_OUTPUT_TYPES,
  type TaskDocument,
  type TaskOutputTypeSource,
} from '@api/collections/tasks/schemas/task.schema';
import { resolveTaskRoutingDecisionRollout } from '@api/collections/tasks/services/task-routing-decision.config';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';

export type TaskRoutingDecision = Pick<
  TaskDocument,
  | 'chosenModel'
  | 'chosenProvider'
  | 'executionPathUsed'
  | 'outputType'
  | 'outputTypeConfidence'
  | 'outputTypeSource'
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
  brandId?: string;
  organizationId?: string;
  outputType?: TaskDocument['outputType'];
  platforms?: string[];
  request?: string;
  userId?: string;
};

/** The outputType a request resolved to, and where that answer came from. */
type OutputTypeResolution = {
  /** Only set when the typed decision point answered above its threshold. */
  confidence?: number;
  outputType: TaskDocument['outputType'];
  source: TaskOutputTypeSource;
};

type ExecutionPath = TaskRoutingDecision['executionPathUsed'];

/**
 * Ordered request-keyword → outputType inference table. The first pattern that
 * matches the (lower-cased) request wins; nothing matching falls through to
 * `ingredient`.
 *
 * This is the deterministic answer of the `task_routing.output_type` decision
 * point (#4867): the whole path in `off` mode, the comparison baseline in
 * `shadow`, and the fallback whenever the provider is unavailable or answers
 * below TASK_ROUTING_MIN_CONFIDENCE.
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
 * Stable telemetry key for this decision point. #4874 queries shadow-mode
 * agreement by it, so it must not change with a refactor.
 */
const OUTPUT_TYPE_DECISION_POINT = 'task_routing.output_type';

const OUTPUT_TYPE_DECISION_QUESTION =
  'Which output type is this content request asking for?';

/**
 * Routing-decision engine for tasks. Resolves a request to an outputType +
 * execution path, preferring a matched brand skill and falling back to the
 * per-outputType fallback config. Extracted out of `TasksService` so the
 * classification logic is testable in isolation and free of persistence.
 *
 * The outputType stage is the `task_routing.output_type` decision point
 * (#4867). Skill selection stays deterministic: `matchesResolutionContext` is
 * a hard gate, and no decision reaches it — the decided outputType only picks
 * the modality the gate is asked about.
 */
@Injectable()
export class TaskRoutingService {
  constructor(
    private readonly skillsService: SkillsService,
    private readonly typedDecisionService: TypedDecisionService,
    private readonly configService: ConfigService,
  ) {}

  async buildRoutingDecision(
    createDto: CreateTaskDto,
    taskTitle: string,
  ): Promise<TaskRoutingDecision> {
    const extended = createDto as CreateTaskDtoExtended;
    const outputTypeResolution = await this.resolveOutputType(createDto);
    const taskIntent = this.buildTaskIntent(
      createDto,
      outputTypeResolution.outputType,
    );
    const brandId = extended.brandId;
    const organizationId = extended.organizationId;

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
          outputTypeResolution,
        );
      }
    }

    return this.buildFallbackRoutingDecision(outputTypeResolution);
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

  /**
   * Resolve the outputType through the decision point, keeping the keyword
   * table as the deterministic answer.
   *
   * An explicitly requested outputType is not a classification problem, so it
   * short-circuits before any provider call. Otherwise `null` (unconfigured
   * provider, timeout, malformed answer) and a sub-threshold confidence are
   * treated identically: take the keyword answer. No provider outcome can fail
   * task creation.
   */
  private async resolveOutputType(
    createDto: CreateTaskDto,
  ): Promise<OutputTypeResolution> {
    const extended = createDto as CreateTaskDtoExtended;
    if (extended.outputType) {
      return { outputType: extended.outputType, source: 'explicit' };
    }

    const request = extended.request ?? '';
    const keywordResolution: OutputTypeResolution = {
      outputType: this.inferOutputTypeFromKeywords(request),
      source: 'keyword',
    };

    const { minConfidence, mode } = resolveTaskRoutingDecisionRollout(
      this.configService,
    );

    if (mode === 'off' || request.trim().length === 0) {
      return keywordResolution;
    }

    const answer = await this.typedDecisionService.choose(
      {
        options: TASK_OUTPUT_TYPES,
        question: OUTPUT_TYPE_DECISION_QUESTION,
        state: this.buildOutputTypeDecisionState(extended, request),
      },
      {
        brandId: extended.brandId,
        decisionPoint: OUTPUT_TYPE_DECISION_POINT,
        // Shadow mode's whole point: the recorded agreement with the keyword
        // table is what gates the flip to `live`.
        deterministicAnswer: keywordResolution.outputType,
        mode,
        organizationId: extended.organizationId,
        userId: extended.userId,
      },
    );

    if (mode !== 'live' || !answer || answer.confidence < minConfidence) {
      return keywordResolution;
    }

    return {
      confidence: answer.confidence,
      outputType: answer.value,
      source: 'decision',
    };
  }

  /**
   * Decision state: the request text plus the structured hints the task
   * already carries. Sent as data to judge, never as instructions.
   */
  private buildOutputTypeDecisionState(
    extended: CreateTaskDtoExtended,
    request: string,
  ): Record<string, unknown> {
    return {
      attachmentCount: extended.linkedEntities?.length ?? 0,
      hasBrand: Boolean(extended.brandId),
      platforms: (extended.platforms ?? []).map((platform) =>
        platform.toLowerCase(),
      ),
      request,
    };
  }

  private inferOutputTypeFromKeywords(
    request: string,
  ): TaskDocument['outputType'] {
    const normalizedRequest = request.toLowerCase();
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
    outputTypeResolution: OutputTypeResolution,
  ): TaskRoutingDecision {
    const targetSkill = matchedSkill.targetSkill;
    const requiresApproval = this.skillRequiresApproval(targetSkill);
    const executionPathUsed = executionPathForOutputType(taskIntent.outputType);

    return {
      chosenModel: 'auto',
      chosenProvider: targetSkill.requiredProviders?.[0] ?? 'genfeed-router',
      executionPathUsed,
      outputType: taskIntent.outputType,
      outputTypeConfidence: outputTypeResolution.confidence,
      outputTypeSource: outputTypeResolution.source,
      resultPreview: requiresApproval
        ? `Prepared with ${targetSkill.name}: ${taskTitle}`
        : undefined,
      reviewState: requiresApproval ? 'pending_approval' : 'none',
      reviewTriggered: requiresApproval,
      routingSummary: `Resolved the request using the brand skill "${targetSkill.name}" (${targetSkill.slug}) for the ${taskIntent.workflowStage} stage.`,
      skillsUsed: targetSkill.slug ? [targetSkill.slug] : [],
      skillVariantIds: matchedSkill.variant?.id
        ? [String(matchedSkill.variant.id)]
        : [],
      status: requiresApproval
        ? 'in_review'
        : executionPathUsed === 'agent_orchestrator'
          ? 'backlog'
          : 'in_progress',
    };
  }

  private buildFallbackRoutingDecision(
    outputTypeResolution: OutputTypeResolution,
  ): TaskRoutingDecision {
    const resolvedOutputType = outputTypeResolution.outputType;
    const config =
      (resolvedOutputType && FALLBACK_BY_OUTPUT_TYPE[resolvedOutputType]) ??
      FALLBACK_DEFAULT;

    return {
      chosenModel: 'auto',
      chosenProvider: 'genfeed-router',
      executionPathUsed: executionPathForOutputType(config.outputType),
      outputType: config.outputType,
      outputTypeConfidence: outputTypeResolution.confidence,
      outputTypeSource: outputTypeResolution.source,
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
