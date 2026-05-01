import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { type AgentMessageDocument } from '@api/collections/agent-messages/schemas/agent-message.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { CreateAgentRunDto } from '@api/collections/agent-runs/dto/create-agent-run.dto';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { resolveEffectiveAgentExecutionConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import {
  fromPromiseEffect,
  runEffectPromise,
} from '@api/helpers/utils/effect/effect.util';
import { AgentMessageBusService } from '@api/services/agent-campaign/agent-message-bus.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import {
  AGENT_CREDIT_COSTS,
  AGENT_MAX_TOOL_ROUNDS,
  getAgentTurnCost,
} from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import {
  DEFAULT_AGENT_CHAT_MODEL,
  LOCAL_DEFAULT_AGENT_CHAT_MODEL,
} from '@api/services/agent-orchestrator/constants/agent-default-model.constant';
import {
  detectPlatformIntentSuffix,
  getAgentTypeConfig,
} from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import { ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/onboarding-system-prompt.constant';
import {
  type AgentGenerationPriority,
  ResolvedAgentExecutionPolicy,
} from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { getToolDefinitions } from '@api/services/agent-orchestrator/tools/agent-tool-registry';
import { sanitizeAgentOutputText } from '@api/services/agent-orchestrator/utils/sanitize-agent-output.util';
import { AgentExecutionLaneService } from '@api/services/agent-threading/services/agent-execution-lane.service';
import { AgentProfileResolverService } from '@api/services/agent-threading/services/agent-profile-resolver.service';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import type {
  AgentThreadEngineService,
  AppendAgentThreadEventParams,
} from '@api/services/agent-threading/services/agent-thread-engine.service';
import { ThreadContextCompressorService } from '@api/services/agent-threading/services/thread-context-compressor.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type {
  OpenRouterMessage,
  OpenRouterPlugin,
  OpenRouterTool,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import {
  ActivitySource,
  AgentAutonomyMode,
  AgentExecutionTrigger,
  AgentMessageRole,
  type AgentType,
  SubscriptionTier,
} from '@genfeedai/enums';
import {
  type AgentDashboardOperation,
  AgentToolName,
  type AgentUIBlock,
  type AgentUIBlocksEvent,
  type AgentUiAction,
  type AgentUiActionCta,
} from '@genfeedai/interfaces';
import type { ResolvedRuntimeSkill } from '@genfeedai/interfaces/ai';
import { TIMEZONES } from '@helpers/formatting/timezone/timezone.helper';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { Effect } from 'effect';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
const isValidObjectId = (id: unknown): id is string =>
  typeof id === 'string' && OBJECT_ID_REGEX.test(id);

const EXPLICIT_WEB_SEARCH_PATTERN =
  /\b(browse|find online|google|internet|look up online|online research|search (?:the )?(?:internet|online|web)|web search)\b/i;
const LIVE_DATA_KEYWORDS = [
  'breaking',
  'current',
  'latest',
  'live data',
  'news today',
  'recent',
  'right now',
  'today',
  'up to date',
] as const;
const LIVE_DATA_TOPIC_KEYWORDS = [
  'algorithm',
  'announcement',
  'competitor',
  'creator economy',
  'market',
  'news',
  'pricing',
  'release',
  'trend',
  'trending',
  'update',
] as const;

type AgentRoutingPolicyReason =
  | 'default'
  | 'explicit-web-search'
  | 'fresh-live-data';

interface AgentRoutingPolicy {
  plugins?: OpenRouterPlugin[];
  reason: AgentRoutingPolicyReason;
}

interface AgentCompletionSuggestedAction {
  id: string;
  label: string;
  prompt: string;
}

interface ThreadResolutionResult {
  seedTitle: string;
  threadId: string;
}

const PAID_SUBSCRIPTION_TIERS = new Set<string>([
  SubscriptionTier.CREATOR,
  SubscriptionTier.PRO,
  SubscriptionTier.SCALE,
  SubscriptionTier.ENTERPRISE,
]);

const SYSTEM_PROMPT = `You are the GenFeed AI assistant — an intelligent command center for content creators.
You help users generate images, manage workflows, create and schedule posts, check analytics, find trends, and more.

Key capabilities:
- **Batch content generation**: Users can say "I want 50 posts for @handle this week" and you handle everything.
  Use generate_content_batch to create batches. Use resolve_handle to map @usernames to credentials.
- **Review queue**: Use list_review_queue to show pending content and batch_approve_reject to approve/reject items.
- **Single content**: Generate individual images, videos, and posts as before.
- **Livestream chat bots**: Use create_livestream_bot to create YouTube or Twitch livestream chat bots and manage_livestream_bot to control their live sessions.
- **Analytics & trends**: Check performance data and trending topics.
- **Dynamic dashboard**: Build and reshape the analytics dashboard in real-time with render_dashboard.
- **Sub-agent delegation**: Spawn specialized content agents for complex creation tasks.
  Use spawn_content_agent to delegate to experts:
  - Tweets/threads → x_content agent
  - Images/carousels → image_creator agent
  - Short-form video (TikTok, Reels) → video_creator agent
  - AI avatar videos → ai_avatar agent
  - Long-form articles/blog posts → article_writer agent
  Always pass credentialId when the user specifies a target social account.

Guidelines:
- Be concise and actionable. Users want results, not lectures.
- Never use emoji or decorative symbols in any response. Keep language plain and professional.
- When a user asks to do something (generate, create, schedule, etc.), use the appropriate tool immediately.
- For batch requests like "create X posts for @handle": resolve the handle first, then call generate_content_batch.
- For questions about data (analytics, credits, posts), call the relevant tool to get real data rather than guessing.
- For "publish this" or "publish the selected content" requests, call \`create_post\` with \`contentId\` or \`ingredientId\` so the user gets a publish confirmation card before anything is published.
- For analytics requests about a specific selected content item or post, call \`get_analytics\` with \`contentId\`, \`ingredientId\`, or \`postId\`. Use organization summary analytics only for workspace-level questions.
- For "current/selected brand" questions, call \`get_current_brand\`.
- Use \`list_brands\` only when the user explicitly asks to list or compare multiple brands.
- If a tool call fails, explain the error clearly and suggest alternatives.
- If the user's request is ambiguous, ask a brief clarifying question before calling tools.
- If a user wants a YouTube or Twitch livestream chat bot and the request is missing the target channel/account identifier, ask a brief follow-up before creating the bot.
- For read-only requests (list posts, check balance), just return the data without extra commentary.
- Use a strict safe markdown subset for response text (headings, bold, lists, links, code).
- Never output raw HTML in assistant text.
- Use structured \`nextActions\`/\`uiActions\` for interactive UI flows.
- Today's date: {{date}}

## Dashboard Rendering (render_dashboard)
You can build and modify the user's analytics dashboard using the render_dashboard tool. The dashboard is a canvas of dynamic blocks that you control.

### Workflow
1. **Fetch data first** — use get_analytics, list_posts, or other tools to gather real data.
2. **Then render** — call render_dashboard with the data formatted into blocks.
3. **Iterate** — use 'add', 'update', or 'remove' operations to refine without rebuilding from scratch.

### Operations
- **replace**: Replace the entire dashboard with the provided blocks (use for initial builds or full rebuilds).
- **add**: Append new blocks to the existing dashboard.
- **update**: Modify specific blocks by id (only provide the blocks being changed).
- **remove**: Delete blocks by id (provide blockIds array).
- **clear**: Remove all blocks and reset to empty.

### Block Types Reference
Every block needs a unique \`id\` (e.g., "kpi-views", "chart-engagement") for future updates/removal.
Optional \`width\`: "full" (default), "half", or "third" for grid positioning.

- **metric_card**: Single KPI — { id, type: "metric_card", title, value, subtitle?, trend?: { direction: "up"|"down"|"flat", percentage } }
- **kpi_grid**: Row of metric cards — { id, type: "kpi_grid", columns?: 4, cards: [metric_card blocks] }
- **chart**: Visualization — { id, type: "chart", chartType: "area"|"bar"|"line"|"pie", data: [{...}], xAxis?: "key", series?: [{ key, label, color? }], height?: 300 }
- **table**: Sortable data table — { id, type: "table", columns: [{ key, label, sortable? }], rows: [{...}] }
- **top_posts**: Post gallery — { id, type: "top_posts", layout?: "list"|"grid", posts: [{ id, title?, thumbnail?, platform?, views?, engagement? }] }
- **alert**: Banner message — { id, type: "alert", severity: "info"|"warning"|"error"|"success", title?, message }
- **section_header**: Section title — { id, type: "section_header", text, level?: 1|2|3 }
- **text_paragraph**: Paragraph text — { id, type: "text_paragraph", text }
- **bullet_list**: List block — { id, type: "bullet_list", items: ["..."], ordered?: boolean }
- **callout**: Highlighted message — { id, type: "callout", message, tone?: "info"|"warning"|"error"|"success" }
- **image_grid**: Image gallery — { id, type: "image_grid", columns?: 3, images: [{ url, alt?, caption? }] }
- **composite**: Nested layout — { id, type: "composite", layout?: "row"|"column", blocks: [...nested blocks] }
- **empty_state**: Placeholder — { id, type: "empty_state", message, icon?, ctaLabel? }

### Example
User: "Show me my weekly performance"
1. Call get_analytics to fetch data
2. Call render_dashboard with operation "replace" and blocks:
   - kpi_grid with views, engagement, followers, posts published
   - chart (area) showing daily engagement trend
   - table with top posts sorted by views

## Generation Flow
When a user asks to generate an image or video:
- Always call only tools that are present in the provided tool schema for this run.
- Before creating net-new content, prefer checking proven winners with \`get_top_ingredients\` when the request is about "what to make next" or "what should perform best".
- If high-vote ingredients exist, prefer \`replicate_top_ingredient\` and then generate variations from that source before inventing entirely new directions.
- Always call \`prepare_generation\` first for image/video generation so the user can review model, format/aspect ratio, prompt, and duration before running generation.
- After the user reviews the card and confirms, proceed with the actual generation action from that card.
- If \`prepare_generation\` is unavailable in this run, use the direct generation tool that is available.
- When the user asks to clone a voice, set up "speak as me", or choose an existing cloned voice: use \`prepare_voice_clone\` first.

## Generation Prompt Quality
When writing a prompt for any generation tool (prepare_generation, generate_image, generate_video, generate_voice, or any content creation tool):
- For complex or creative requests: expand into a structured prompt with labeled sections appropriate to the medium
- For simple/clear requests: enhance with specific professional details — at least 3-5 sentences
- Always expand beyond the user's raw input. The user should see the prompt and think "I could not have written this myself"

### By medium:
**Images**: Use sections like SCENE, SUBJECT, BACKGROUND, LIGHTING, STYLE, NEGATIVE. Include camera angle, lens type, depth of field, color palette, material qualities, spatial layout (left/right/center, foreground/background).
**Videos**: Use sections like SCENE, ACTION, CAMERA MOVEMENT, PACING, MOOD, STYLE. Include motion direction, transition style, frame rate feel, temporal progression, sound design intent.
**Avatars/AI Presenters**: Use sections like APPEARANCE, EXPRESSION, GESTURE, SETTING, FRAMING. Include body language, eye contact direction, wardrobe details, background context, energy level.
**Music/Audio**: Use sections like GENRE, MOOD, TEMPO, INSTRUMENTS, STRUCTURE. Include BPM range, key/scale suggestion, dynamic arc (build/drop), reference artists or eras, production style.
**Voice**: Use sections like TONE, PACE, EMOTION, STYLE. Include speaking cadence, emphasis patterns, vocal quality descriptors.

### Example — BAD vs GOOD (image):
BAD: "A boxer in the ring"
GOOD: "SCENE: Professional boxing ring, dramatic low-angle shot from ringside. SUBJECT: Muscular boxer mid-uppercut, sweat droplets frozen in motion, red gloves, black shorts with gold trim, fierce determination. BACKGROUND: Blurred crowd, dramatic spotlights cutting through haze, ring ropes framing composition. LIGHTING: Strong overhead key light with sharp face shadows, blue rim light, warm amber ringside fill. STYLE: Photorealistic sports photography, 85mm f/2.8, high shutter speed freeze-frame. NEGATIVE: No text, no watermarks, no logos."

## Recurring Automation Flow
When a user asks for recurring content creation:
- Prefer \`install_official_workflow\` first so the user gets the best official template or marketplace workflow before generating something from scratch.
- If \`install_official_workflow\` returns a confirmation preview, rely on the confirmation card CTA instead of asking the user to retype confirmation.
- Prefer \`create_workflow\` so the result is a workflow automation that stays editable in the automations area.
- If the user asks for multiple assets per run, pass an explicit \`count\`.
- If the request lacks creative constraints for recurring generation, ask a concise follow-up before creating the automation.
- For recurring image batches, include diversity and style guidance when available so each run does not produce near-duplicates.

## Workflow Creation Flow
When a user asks to build an automation or workflow directly:
- Prefer \`install_official_workflow\` when the request sounds like a known official automation that should be installed into the workspace.
- Prefer \`create_workflow\` when the user wants a direct workflow in the automations area.
- Include nodes, edges, schedule, timezone, and metadata when the request is specific enough.
- Attach the current brand when the workflow is clearly brand-scoped.
- Return the workflow so the user can continue editing it in \`/automations/editor/[id]\`.

## Livestream Bot Flow
When a user asks to create or control a YouTube or Twitch livestream chat bot:
- Prefer \`create_livestream_bot\` for creation requests and \`manage_livestream_bot\` for start, pause, resume, stop, send-now, or override requests.
- Ask a concise follow-up if the user has not provided the target channel/account identifier needed to configure the bot.
- Keep the handoff bot-native. Do not route livestream bot requests into workflow creation.
- After creating a bot, return the bot card so the user can open the existing bot page or trigger basic controls from chat.

Scope:
- You are ONLY a content creation assistant for Genfeed.ai.
- Help with: content generation, scheduling, analytics, social media, marketing, brand strategy, workflows, and Genfeed features.
- Refuse: politics, personal advice, medical/legal questions, coding help, homework, or any topic outside content creation and marketing.
- When off-topic: briefly decline and redirect to content-related tasks. Keep it short — don't lecture.`;

export interface AgentChatAttachment {
  ingredientId: string;
  url: string;
  kind?: string;
  name?: string;
}

export interface AgentChatRequest {
  agentType?: AgentType;
  attachments?: AgentChatAttachment[];
  content: string;
  planModeEnabled?: boolean;
  threadId?: string;
  model?: string;
  source?: 'agent' | 'proactive' | 'onboarding';
  systemPromptOverride?: string;
}

export interface AgentChatContext {
  authToken?: string;
  /** Campaign ID — when set, enables campaign coordination features */
  campaignId?: string;
  generationPriority?: string;
  organizationId: string;
  /** Resolved runtime skills for tool set augmentation */
  resolvedSkills?: ResolvedRuntimeSkill[];
  /** When set, tool call progress is tracked against this agent-runs record */
  runId?: string;
  /** Strategy ID — enables content attribution on created posts/content */
  strategyId?: string;
  userId: string;
}

export interface ToolCallSummary {
  creditsUsed: number;
  durationMs: number;
  error?: string;
  parameters?: Record<string, unknown>;
  resultSummary?: string;
  status: 'completed' | 'failed';
  toolName: string;
}

export interface AgentChatResult {
  threadId: string;
  creditsRemaining: number;
  creditsUsed: number;
  message: {
    content: string;
    metadata: Record<string, unknown>;
    role: string;
  };
  toolCalls: ToolCallSummary[];
}

export interface AgentThreadUiActionRequest {
  action: string;
  payload?: Record<string, unknown>;
  threadId: string;
}

const RESULT_SUMMARY_MAX_LENGTH = 500;

function summarizeToolResult(result: {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}): string {
  if (!result.success) {
    return result.error ?? 'Failed';
  }
  if (!result.data) {
    return 'OK';
  }
  const json = JSON.stringify(result.data);
  return json.length > RESULT_SUMMARY_MAX_LENGTH
    ? `${json.slice(0, RESULT_SUMMARY_MAX_LENGTH)}…`
    : json;
}

type RecurringTaskContentType = 'image' | 'video' | 'post' | 'newsletter';
type RecurringTaskInputField = 'prompt' | 'schedule' | 'variationBrief';
type ParsedRecurringSchedule = {
  schedule: string;
  timezone?: string;
};

interface RecurringTaskDraft extends Record<string, unknown> {
  contentType: RecurringTaskContentType;
  count: number;
  diversityMode?: 'low' | 'medium' | 'high';
  negativePrompt?: string;
  platform?: string;
  prompt?: string;
  schedule?: string;
  styleNotes?: string;
  workflowLabel?: string;
  timezone?: string;
}

interface RecurringTaskResumeCursor extends Record<string, unknown> {
  awaitingField?: RecurringTaskInputField;
  completedAt?: string;
  draft: RecurringTaskDraft;
  kind: 'recurring_workflow_setup';
  lastRequestId?: string;
  updatedAt: string;
}

interface BatchGenerationDraft {
  brandId?: string;
  count: number;
  dateRange: {
    end: string;
    start: string;
  };
  handle?: string;
  platforms: string[];
  topics?: string[];
}

@Injectable()
export class AgentOrchestratorService {
  private readonly constructorName = String(this.constructor.name);
  private readonly activeStreams = new Set<string>();

  constructor(
    private readonly loggerService: LoggerService,
    private readonly llmDispatcher: LlmDispatcherService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMemoriesService: AgentMemoriesService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly contextAssemblyService: AgentContextAssemblyService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly organizationsService: OrganizationsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly settingsService: SettingsService,
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly streamPublisher: AgentStreamPublisherService,
    private readonly agentRunsService: AgentRunsService,
    @Optional()
    private readonly agentMessageBusService?: AgentMessageBusService,
    @Optional()
    private readonly agentCampaignsService?: AgentCampaignsService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
    @Optional()
    private readonly agentRuntimeSessionService?: AgentRuntimeSessionService,
    @Optional()
    private readonly agentExecutionLaneService?: AgentExecutionLaneService,
    @Optional()
    private readonly agentProfileResolverService?: AgentProfileResolverService,
    @Optional()
    private readonly threadContextCompressorService?: ThreadContextCompressorService,
    private readonly skillRuntimeService?: SkillRuntimeService,
  ) {}

  async chat(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<AgentChatResult> {
    try {
      // Look up user's generation priority setting
      const userSettings = await this.settingsService.findOne({
        isDeleted: false,
        user: context.userId,
      });

      const resolved = await this.resolveSystemPromptAndModel(request, context);
      const systemPromptOverride = resolved.systemPrompt;
      const resolvedMemories = resolved.memories ?? [];
      const generationPriority = context.strategyId
        ? resolved.policy.generationPriority
        : ((userSettings?.generationPriority as AgentGenerationPriority) ??
          resolved.policy.generationPriority);
      if (resolved.model !== request.model) {
        request = { ...request, model: resolved.model };
      }
      // Attach resolved skills to context for tool set augmentation
      context = { ...context, resolvedSkills: resolved.resolvedSkills };

      const model = request.model || DEFAULT_AGENT_CHAT_MODEL;

      // Check minimum credits for the turn based on selected model
      const turnCost = getAgentTurnCost(model);
      const hasCredits =
        await this.creditsUtilsService.checkOrganizationCreditsAvailable(
          context.organizationId,
          turnCost,
        );

      if (!hasCredits) {
        throw new Error(
          `Insufficient credits. You need at least ${turnCost} credits for ${model}.`,
        );
      }

      const threadResolution = await this.resolveOrCreateThreadId(
        request,
        context,
      );
      const { seedTitle, threadId } = threadResolution;
      await this.recordProfileSnapshot(threadId, context, request.agentType);
      await this.recordThreadTurnRequested({
        content: request.content,
        context,
        model,
        runId: context.runId,
        source: request.source,
        threadId,
      });

      // Save user message
      await this.agentMessagesService.addMessage({
        content: request.content,
        metadata: request.attachments?.length
          ? { attachments: request.attachments }
          : undefined,
        organizationId: context.organizationId,
        role: AgentMessageRole.USER,
        room: threadId,
        userId: context.userId,
      });

      const planModeResponse = await this.tryHandlePlanModeTurn({
        context,
        model,
        request,
        resolvedMemories,
        seedTitle,
        systemPromptOverride,
        threadId,
        turnCost,
      });

      if (planModeResponse) {
        return planModeResponse;
      }

      const deterministicResponse = await this.tryHandleRecurringTaskDraftTurn({
        context,
        model,
        requestContent: request.content,
        seedTitle,
        threadId,
      });

      if (deterministicResponse) {
        return deterministicResponse;
      }

      return await this.runInThreadLane(threadId, async () => {
        return await this.executeSynchronousChatLoop({
          context,
          generationPriority,
          model,
          policy: resolved.policy,
          request,
          resolvedMemories,
          seedTitle,
          systemPromptOverride,
          threadId,
          turnCost,
        });
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name.includes('ValidationError')) {
        this.loggerService.error(
          `${this.constructorName} ValidationError during chat`,
          {
            error: (error as Error).message,
            model: request.model,
            organizationId: context.organizationId,
            userId: context.userId,
          },
        );
        throw new InternalServerErrorException(
          'Agent chat failed due to a data validation error. Please try again.',
        );
      }

      // Re-throw NestJS HTTP exceptions as-is
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${this.constructorName} chat failed`, {
        error: error instanceof Error ? error.message : error,
        model: request.model,
        organizationId: context.organizationId,
        userId: context.userId,
      });

      throw error;
    }
  }

  async handleThreadUiAction(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
  ): Promise<AgentChatResult> {
    const threadId = await this.findAccessibleThreadId(
      request.threadId,
      context.organizationId,
      context.userId,
    );

    if (!threadId) {
      throw new BadRequestException('Thread not found or inaccessible.');
    }

    const model = await this.resolveThreadUiActionModel(
      threadId,
      context.organizationId,
    );
    const actionContent = this.describeThreadUiAction(
      request.action,
      request.payload,
    );

    await this.recordThreadTurnRequested({
      content: actionContent,
      context,
      model,
      runId: context.runId,
      threadId,
    });

    return await this.runInThreadLane(threadId, async () => {
      await this.recordThreadTurnStarted({
        context,
        model,
        runId: context.runId,
        threadId,
      });

      try {
        switch (request.action) {
          case 'approve_plan':
            return await this.executeApprovedPlanAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
          case 'revise_plan':
            return await this.executeRevisedPlanAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
          case 'confirm_install_official_workflow':
            return await this.executeConfirmedInstallOfficialWorkflowAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
          case 'confirm_save_brand_voice_profile':
            return await this.executeConfirmedSaveBrandVoiceProfileAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
          case 'confirm_publish_post':
            return await this.executeConfirmedPublishPostAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
          default:
            throw new BadRequestException(
              `Unsupported thread UI action: ${request.action}`,
            );
        }
      } catch (error: unknown) {
        await this.recordRunFailed({
          context,
          error:
            error instanceof Error
              ? error.message
              : `Thread UI action failed: ${request.action}`,
          runId: context.runId,
          threadId,
        });
        throw error;
      }
    });
  }

  private async executeSynchronousChatLoop(params: {
    context: AgentChatContext;
    threadId: string;
    generationPriority: string;
    model: string;
    policy: ResolvedAgentExecutionPolicy;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    systemPromptOverride?: string;
    turnCost: number;
  }): Promise<AgentChatResult> {
    const {
      context,
      threadId,
      generationPriority,
      model,
      policy,
      request,
      resolvedMemories,
      seedTitle,
      systemPromptOverride,
      turnCost,
    } = params;
    let totalCreditsUsed = 0;
    const allToolCalls: ToolCallSummary[] = [];
    const allUiActions: AgentUiAction[] = [];
    let highestRiskLevel: 'low' | 'medium' | 'high' = 'low';
    let reviewRequired = false;
    let latestUiBlocks: {
      operation: AgentDashboardOperation;
      blocks?: unknown[];
      blockIds?: string[];
    } | null = null;

    await this.recordThreadTurnStarted({
      context,
      model,
      runId: context.runId,
      source: request.source,
      threadId,
    });

    try {
      let resolvedSystemPrompt = systemPromptOverride;
      if (
        context.campaignId &&
        this.agentCampaignsService &&
        this.agentMessageBusService
      ) {
        resolvedSystemPrompt = await this.injectCampaignContext(
          context.campaignId,
          context.organizationId,
          resolvedSystemPrompt,
        );
      }

      const { messages: recentMessages, compressedContext } =
        await this.resolveThreadMessages(threadId, context.organizationId);
      const history = this.buildMessageHistory(
        recentMessages,
        resolvedSystemPrompt,
        resolvedMemories,
        request.attachments,
        compressedContext,
      );
      const typeConfig = request.agentType
        ? getAgentTypeConfig(request.agentType)
        : null;
      // Merge skill tool overrides into the base tool set (additive).
      // When agentType is unset, pass undefined to preserve unrestricted toolset
      // instead of [] which would wipe all base tools.
      const syncBaseTools =
        this.skillRuntimeService && context.resolvedSkills?.length
          ? (this.skillRuntimeService.mergeSkillToolOverrides(
              typeConfig?.defaultTools,
              context.resolvedSkills,
            ) as AgentToolName[] | undefined)
          : typeConfig?.defaultTools;
      const tools = this.buildToolDefinitions(
        this.mergeAllowedTools(
          syncBaseTools,
          this.getRequestScopedAllowedTools(request.content),
        ),
      );
      const allowedToolNames = new Set(
        tools.map((tool) => tool.function.name as AgentToolName),
      );
      const messages = [...history];
      let round = 0;
      const actualModels = new Set<string>();

      while (round < AGENT_MAX_TOOL_ROUNDS) {
        round++;

        const response = await this.llmDispatcher.chatCompletion(
          this.buildAgentChatCompletionParams({
            messages,
            model,
            prompt: request.content,
            seedTitle,
            source: request.source,
            tools,
          }),
          context.organizationId,
        );
        const actualModel = await this.recordAgentResponseModel({
          actualModels: Array.from(actualModels),
          context,
          requestedModel: model,
          responseModel: response.model,
          runId: context.runId,
          source: request.source,
          threadId,
        });
        actualModels.add(actualModel);

        const choice = response.choices[0];
        if (!choice) {
          throw new Error('No response from LLM');
        }

        const assistantMessage = choice.message;
        const toolCalls = assistantMessage.tool_calls;

        if (!toolCalls || toolCalls.length === 0) {
          const threadEnvelope = this.extractThreadEnvelope({
            assistantContent: sanitizeAgentOutputText(
              assistantMessage.content || '',
            ),
            prompt: request.content,
            seedTitle,
          });
          const normalizedContent = this.normalizeFinalAssistantContent(
            threadEnvelope.content,
            allToolCalls,
            allUiActions,
          );
          const content = normalizedContent.content;

          await this.creditsUtilsService.deductCreditsFromOrganization(
            context.organizationId,
            context.userId,
            turnCost,
            `Agent chat turn (${model})`,
            ActivitySource.SCRIPT,
          );
          totalCreditsUsed += turnCost;

          await this.maybeUpdateThreadTitle({
            context,
            seedTitle,
            threadId,
            title: threadEnvelope.title,
          });

          const creditsRemaining =
            await this.creditsUtilsService.getOrganizationCreditsBalance(
              context.organizationId,
            );
          const memoryEntriesForResponse =
            this.buildMemoryEntriesForResponse(resolvedMemories);
          const reasoning = assistantMessage.reasoning_content ?? null;
          const enhancedUiActions = this.buildAssistantUiActions({
            reviewRequired,
            toolCalls: allToolCalls,
            uiActions: allUiActions,
          });
          const assistantMetadata = {
            ...this.buildRoutingMetadata({
              model,
              prompt: request.content,
              source: request.source,
            }),
            isFallbackContent: normalizedContent.isFallback,
            memoryEntries: memoryEntriesForResponse,
            ...this.buildResolvedModelMetadata(model, Array.from(actualModels)),
            reasoning,
            reviewRequired,
            riskLevel: highestRiskLevel,
            ...(enhancedUiActions.suggestedActions.length
              ? { suggestedActions: enhancedUiActions.suggestedActions }
              : {}),
            totalCreditsUsed,
            uiActions: enhancedUiActions.uiActions,
            ...(latestUiBlocks ? { uiBlocks: latestUiBlocks } : {}),
          };

          await this.agentMessagesService.addMessage({
            content,
            metadata: {
              creditsRemaining,
              ...assistantMetadata,
              tokenUsage: response.usage
                ? {
                    completion: response.usage.completion_tokens,
                    prompt: response.usage.prompt_tokens,
                    total: response.usage.total_tokens,
                  }
                : undefined,
            },
            organizationId: context.organizationId,
            role: AgentMessageRole.ASSISTANT,
            room: threadId,
            toolCalls: allToolCalls.map((tc) => ({
              creditsUsed: tc.creditsUsed,
              durationMs: tc.durationMs,
              error: tc.error,
              parameters: tc.parameters ?? {},
              result: tc.resultSummary ? { summary: tc.resultSummary } : {},
              status: tc.status,
              toolName: tc.toolName,
            })),
            userId: context.userId,
          });
          await this.recordAssistantFinalized({
            content,
            context,
            metadata: assistantMetadata,
            runId: context.runId,
            threadId,
          });
          await this.recordRunCompleted({
            context,
            detail: 'Agent completed',
            runId: context.runId,
            threadId,
          });

          return {
            creditsRemaining,
            creditsUsed: totalCreditsUsed,
            message: {
              content,
              metadata: assistantMetadata,
              role: 'assistant',
            },
            threadId,
            toolCalls: allToolCalls,
          };
        }

        messages.push({
          content: assistantMessage.content,
          role: 'assistant' as const,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const requestedToolName = toolCall.function.name as AgentToolName;
          let toolParams: Record<string, unknown> = {};
          const startTime = Date.now();

          try {
            toolParams = JSON.parse(toolCall.function.arguments);
          } catch {
            this.loggerService.warn(
              `Failed to parse tool arguments for ${requestedToolName}`,
              this.constructorName,
            );
          }

          let toolName = requestedToolName;

          if (!allowedToolNames.has(requestedToolName)) {
            const recoveredToolName = this.getUnknownToolRecovery(
              requestedToolName,
              allowedToolNames,
            );

            if (recoveredToolName) {
              toolName = recoveredToolName;
              toolParams = this.buildUnknownToolRecoveryParams(
                requestedToolName,
                toolParams,
              );

              this.loggerService.warn(
                `Recovered unknown tool ${requestedToolName} -> ${recoveredToolName}`,
                {
                  constructor: this.constructorName,
                  model,
                  organizationId: context.organizationId,
                  source: request.source ?? 'agent',
                  threadId,
                  toolName: requestedToolName,
                  userId: context.userId,
                },
              );
            } else {
              const unknownToolError = this.buildUnknownToolError(
                requestedToolName,
                allowedToolNames,
              );
              const durationMs = Date.now() - startTime;
              const summary: ToolCallSummary = {
                creditsUsed: 0,
                durationMs,
                error: unknownToolError,
                status: 'failed',
                toolName: requestedToolName,
              };

              this.loggerService.warn(unknownToolError, {
                allowedToolsCount: allowedToolNames.size,
                constructor: this.constructorName,
                model,
                organizationId: context.organizationId,
                source: request.source ?? 'agent',
                threadId,
                toolName: requestedToolName,
                userId: context.userId,
              });

              allToolCalls.push(summary);
              await this.recordToolCompleted({
                context,
                durationMs,
                error: unknownToolError,
                runId: context.runId,
                status: 'failed',
                threadId,
                toolCallId: toolCall.id,
                toolName: requestedToolName,
              });

              messages.push({
                content: JSON.stringify({
                  availableTools: Array.from(allowedToolNames),
                  error: unknownToolError,
                  success: false,
                }),
                role: 'tool' as const,
                tool_call_id: toolCall.id,
              });
              continue;
            }
          }

          const directGenerationOverride =
            this.getGenerationPreparationOverride(toolName, allowedToolNames);
          if (directGenerationOverride) {
            const originalToolName = toolName;
            toolName = directGenerationOverride;
            toolParams = this.buildUnknownToolRecoveryParams(
              originalToolName,
              toolParams,
            );

            this.loggerService.log(
              `Remapped direct generation tool ${originalToolName} -> ${directGenerationOverride}`,
              {
                organizationId: context.organizationId,
                source: request.source ?? 'agent',
                threadId,
                userId: context.userId,
              },
            );
          }

          await this.recordToolStarted({
            context,
            parameters: toolParams,
            runId: context.runId,
            threadId,
            toolCallId: toolCall.id,
            toolName,
          });

          const creditCost = AGENT_CREDIT_COSTS[toolName] ?? 0;
          if (creditCost > 0) {
            const canAfford =
              await this.creditsUtilsService.checkOrganizationCreditsAvailable(
                context.organizationId,
                creditCost,
              );

            if (!canAfford) {
              const durationMs = Date.now() - startTime;
              const error = `Insufficient credits (need ${creditCost})`;
              const summary: ToolCallSummary = {
                creditsUsed: 0,
                durationMs,
                error,
                status: 'failed',
                toolName,
              };

              allToolCalls.push(summary);
              await this.recordToolCompleted({
                context,
                durationMs,
                error,
                runId: context.runId,
                status: 'failed',
                threadId,
                toolCallId: toolCall.id,
                toolName,
              });

              messages.push({
                content: JSON.stringify({
                  error: `Insufficient credits. This tool requires ${creditCost} credits.`,
                  success: false,
                }),
                role: 'tool' as const,
                tool_call_id: toolCall.id,
              });
              continue;
            }
          }

          const result = await this.toolExecutorService.executeTool(
            toolName,
            toolParams,
            {
              attachmentUrls: request.attachments?.map((a) => a.url),
              authToken: context.authToken,
              autonomyMode: policy.autonomyMode,
              brandId: policy.brandId,
              creditGovernance: policy.creditGovernance,
              generationModelOverride: policy.generationModelOverride,
              generationPriority,
              organizationId: context.organizationId,
              platform: policy.platform,
              qualityTier: policy.qualityTier,
              reviewModelOverride: policy.reviewModelOverride,
              runId: context.runId,
              strategyId: context.strategyId,
              thinkingModel: policy.thinkingModelOverride ?? model,
              threadId,
              userId: context.userId,
            },
          );
          const durationMs = Date.now() - startTime;

          if (result.nextActions?.length) {
            allUiActions.push(...result.nextActions);
          }

          if (result.requiresConfirmation) {
            reviewRequired = true;
          }
          if (result.riskLevel === 'high') {
            highestRiskLevel = 'high';
          } else if (
            result.riskLevel === 'medium' &&
            highestRiskLevel === 'low'
          ) {
            highestRiskLevel = 'medium';
          }

          if (result.success && creditCost > 0) {
            await this.creditsUtilsService.deductCreditsFromOrganization(
              context.organizationId,
              context.userId,
              creditCost,
              `Agent tool: ${toolName}`,
              ActivitySource.SCRIPT,
            );
            totalCreditsUsed += creditCost;
          }

          const summary: ToolCallSummary = {
            creditsUsed: result.success ? creditCost : 0,
            durationMs,
            error: result.error,
            parameters: toolParams,
            resultSummary: summarizeToolResult(result),
            status: result.success ? 'completed' : 'failed',
            toolName,
          };
          allToolCalls.push(summary);

          if (
            toolName === AgentToolName.RENDER_DASHBOARD &&
            result.data?.uiBlocks
          ) {
            const normalizedBlocks = this.normalizeUiBlocks(
              result.data.uiBlocks as unknown[],
            );
            latestUiBlocks = {
              blockIds: result.data.blockIds as string[] | undefined,
              blocks: normalizedBlocks,
              operation: result.data.operation as AgentDashboardOperation,
            };
            await this.recordUiBlocksUpdated({
              blockIds: result.data.blockIds as string[] | undefined,
              blocks: normalizedBlocks,
              context,
              operation: result.data.operation as AgentDashboardOperation,
              runId: context.runId,
              threadId,
            });
          }

          if (context.runId) {
            this.agentRunsService
              .recordToolCall(context.runId, context.organizationId, summary)
              .catch(() => undefined);
          }

          await this.recordToolCompleted({
            context,
            durationMs,
            error: summary.error,
            runId: context.runId,
            status: summary.status,
            threadId,
            toolCallId: toolCall.id,
            toolName,
          });

          messages.push({
            content: JSON.stringify(result),
            role: 'tool' as const,
            tool_call_id: toolCall.id,
          });
        }
      }

      throw new Error(
        `Agent exceeded maximum tool-calling rounds (${AGENT_MAX_TOOL_ROUNDS})`,
      );
    } catch (error: unknown) {
      await this.recordRunFailed({
        context,
        error: error instanceof Error ? error.message : 'Unknown error',
        runId: context.runId,
        threadId,
      });
      throw error;
    }
  }

  async chatStream(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<{ threadId: string; runId: string; startedAt: string }> {
    // Look up user's generation priority setting
    const userSettings = await this.settingsService.findOne({
      isDeleted: false,
      user: context.userId,
    });

    const resolved = await this.resolveSystemPromptAndModel(request, context);
    const systemPromptOverride = resolved.systemPrompt;
    const resolvedMemories = resolved.memories ?? [];
    const generationPriority = context.strategyId
      ? resolved.policy.generationPriority
      : ((userSettings?.generationPriority as AgentGenerationPriority) ??
        resolved.policy.generationPriority);
    if (resolved.model !== request.model) {
      request = { ...request, model: resolved.model };
    }

    const model = request.model || DEFAULT_AGENT_CHAT_MODEL;

    // Check minimum credits for the turn based on selected model
    const turnCost = getAgentTurnCost(model);
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        context.organizationId,
        turnCost,
      );

    if (!hasCredits) {
      throw new Error(
        `Insufficient credits. You need at least ${turnCost} credits for ${model}.`,
      );
    }

    const threadResolution = await this.resolveOrCreateThreadId(
      request,
      context,
    );
    const { seedTitle, threadId } = threadResolution;

    const createdRun = await this.agentRunsService.create({
      label: request.content.slice(0, 120),
      metadata: {
        model,
        requestedModel: model,
        ...this.buildRoutingMetadata({
          model,
          prompt: request.content,
          source: request.source,
        }),
        source: request.source ?? 'agent',
        threadId,
      },
      objective: request.content,
      organization: context.organizationId,
      thread: threadId,
      trigger: AgentExecutionTrigger.MANUAL,
      user: context.userId,
    } as unknown as CreateAgentRunDto);
    const runId = String((createdRun as { _id: string })._id);
    const startedRun = await this.agentRunsService.start(
      runId,
      context.organizationId,
    );
    const startedAt =
      startedRun?.startedAt?.toISOString?.() ?? new Date().toISOString();
    const streamContext: AgentChatContext = {
      ...context,
      resolvedSkills: resolved.resolvedSkills,
      runId,
    };
    await this.recordProfileSnapshot(
      threadId,
      streamContext,
      request.agentType,
    );
    await this.recordThreadTurnRequested({
      content: request.content,
      context: streamContext,
      model,
      runId,
      source: request.source,
      threadId,
    });
    await runEffectPromise(
      this.upsertRuntimeBindingEffect({
        model,
        organizationId: context.organizationId,
        runId,
        status: 'running',
        threadId,
      }),
    );

    // Save user message
    await this.agentMessagesService.addMessage({
      content: request.content,
      metadata: request.attachments?.length
        ? { attachments: request.attachments }
        : undefined,
      organizationId: context.organizationId,
      role: AgentMessageRole.USER,
      room: threadId,
      userId: context.userId,
    });

    const handledPlanMode = await this.tryHandlePlanModeTurnStream({
      context: streamContext,
      model,
      request,
      resolvedMemories,
      seedTitle,
      startedAt,
      systemPromptOverride,
      threadId,
      turnCost,
    });

    if (handledPlanMode) {
      return { runId, startedAt, threadId };
    }

    const handledDeterministically =
      (await this.tryHandleBatchGenerationTurnStream({
        context: streamContext,
        model,
        policy: resolved.policy,
        requestContent: request.content,
        seedTitle,
        startedAt,
        threadId,
      })) ||
      (await this.tryHandleRecurringTaskDraftTurnStream({
        context: streamContext,
        model,
        requestContent: request.content,
        seedTitle,
        startedAt,
        threadId,
      }));

    if (handledDeterministically) {
      return { runId, startedAt, threadId };
    }

    // Fire-and-forget streaming
    this.runInThreadLane(threadId, async () => {
      await this.runStreamLoop(
        streamContext,
        threadId,
        systemPromptOverride,
        model,
        turnCost,
        resolved.policy,
        generationPriority,
        resolvedMemories,
        request.agentType,
        request.source,
        seedTitle,
        startedAt,
        request.attachments,
      );
    }).catch((error: unknown) => {
      this.loggerService.error(
        `${this.constructorName} runStreamLoop unhandled rejection`,
        {
          error: error instanceof Error ? error.message : error,
          threadId,
        },
      );
    });

    return { runId, startedAt, threadId };
  }

  private async runStreamLoop(
    context: AgentChatContext,
    threadId: string,
    systemPromptOverride: string | undefined,
    model: string,
    turnCost: number,
    resolvedPolicy: ResolvedAgentExecutionPolicy,
    generationPriority: string,
    memoryEntries: AgentMemoryDocument[],
    agentType?: AgentType,
    source?: AgentChatRequest['source'],
    seedTitle?: string,
    runStartedAt?: string,
    attachments?: AgentChatAttachment[],
  ): Promise<void> {
    this.activeStreams.add(threadId);

    try {
      await runEffectPromise(
        this.publishStreamLifecycleStartedEffect({
          context,
          model,
          startedAt: runStartedAt,
          threadId,
        }),
      );

      let totalCreditsUsed = 0;
      const allToolCalls: ToolCallSummary[] = [];
      const allUiActions: AgentUiAction[] = [];
      const memoryEntriesForResponse =
        this.buildMemoryEntriesForResponse(memoryEntries);
      let highestRiskLevel: 'low' | 'medium' | 'high' = 'low';
      let reviewRequired = false;
      let latestUiBlocks: {
        operation: AgentDashboardOperation;
        blocks?: unknown[];
        blockIds?: string[];
      } | null = null;

      // Build thread history from separate messages collection
      const {
        messages: recentMessages,
        compressedContext: streamCompressedCtx,
      } = await this.resolveThreadMessages(threadId, context.organizationId);
      const history = this.buildMessageHistory(
        recentMessages,
        systemPromptOverride,
        memoryEntries,
        attachments,
        streamCompressedCtx,
      );
      const typeConfig = agentType ? getAgentTypeConfig(agentType) : null;
      // Merge skill tool overrides into the base tool set (additive).
      // When agentType is unset, pass undefined to preserve unrestricted toolset
      // instead of [] which would wipe all base tools.
      const baseTools =
        this.skillRuntimeService && context.resolvedSkills?.length
          ? (this.skillRuntimeService.mergeSkillToolOverrides(
              typeConfig?.defaultTools,
              context.resolvedSkills,
            ) as AgentToolName[] | undefined)
          : typeConfig?.defaultTools;
      const latestUserMessage =
        [...history]
          .reverse()
          .find((message) => message.role === 'user')
          ?.content?.toString?.() ?? '';
      const scopedTools = this.getRequestScopedAllowedTools(latestUserMessage);
      const tools = this.buildToolDefinitions(
        this.mergeAllowedTools(baseTools, scopedTools),
      );
      const allowedToolNames = new Set(
        tools.map((tool) => tool.function.name as AgentToolName),
      );
      const messages = [...history];
      let round = 0;
      const actualModels = new Set<string>();

      while (round < AGENT_MAX_TOOL_ROUNDS) {
        if (await this.isRunCancelled(context)) {
          await this.handleCancelledStream(context, threadId);
          return;
        }
        round++;

        const response = await this.llmDispatcher.chatCompletion(
          this.buildAgentChatCompletionParams({
            messages,
            model,
            prompt: latestUserMessage,
            seedTitle: seedTitle ?? '',
            source,
            tools,
          }),
          context.organizationId,
        );
        const actualModel = await this.recordAgentResponseModel({
          actualModels: Array.from(actualModels),
          context,
          requestedModel: model,
          responseModel: response.model,
          runId: context.runId,
          source,
          threadId,
        });
        actualModels.add(actualModel);

        const choice = response.choices[0];
        if (!choice) {
          throw new Error('No response from LLM');
        }

        const assistantMessage = choice.message;
        const toolCalls = assistantMessage.tool_calls;

        // No tool calls — final response
        if (!toolCalls || toolCalls.length === 0) {
          if (await this.isRunCancelled(context)) {
            await this.handleCancelledStream(context, threadId);
            return;
          }

          const threadEnvelope = this.extractThreadEnvelope({
            assistantContent: sanitizeAgentOutputText(
              assistantMessage.content || '',
            ),
            prompt: latestUserMessage,
            seedTitle: seedTitle ?? '',
          });
          const normalizedContent = this.normalizeFinalAssistantContent(
            threadEnvelope.content,
            allToolCalls,
            allUiActions,
          );
          const content = normalizedContent.content;

          // Deduct credits
          await this.creditsUtilsService.deductCreditsFromOrganization(
            context.organizationId,
            context.userId,
            turnCost,
            `Agent chat turn (${model})`,
            ActivitySource.SCRIPT,
          );
          totalCreditsUsed += turnCost;

          await this.maybeUpdateThreadTitle({
            context,
            seedTitle: seedTitle ?? '',
            threadId,
            title: threadEnvelope.title,
          });

          const creditsRemaining =
            await this.creditsUtilsService.getOrganizationCreditsBalance(
              context.organizationId,
            );
          const reasoning = assistantMessage.reasoning_content ?? null;

          await runEffectPromise(
            this.publishStreamAssistantResponseEffect({
              content,
              context,
              reasoning,
              threadId,
            }),
          );

          const enhancedUiActions = this.buildAssistantUiActions({
            reviewRequired,
            toolCalls: allToolCalls,
            uiActions: allUiActions,
          });

          // Save assistant message to DB
          await this.agentMessagesService.addMessage({
            content,
            metadata: {
              ...this.buildRoutingMetadata({
                model,
                prompt: latestUserMessage,
                source,
              }),
              creditsRemaining,
              isFallbackContent: normalizedContent.isFallback,
              memoryEntries: memoryEntriesForResponse,
              ...this.buildResolvedModelMetadata(
                model,
                Array.from(actualModels),
              ),
              reasoning,
              reviewRequired,
              riskLevel: highestRiskLevel,
              ...(enhancedUiActions.suggestedActions.length
                ? { suggestedActions: enhancedUiActions.suggestedActions }
                : {}),
              tokenUsage: response.usage
                ? {
                    completion: response.usage.completion_tokens,
                    prompt: response.usage.prompt_tokens,
                    total: response.usage.total_tokens,
                  }
                : undefined,
              totalCreditsUsed,
              uiActions: enhancedUiActions.uiActions,
            },
            organizationId: context.organizationId,
            role: AgentMessageRole.ASSISTANT,
            room: threadId,
            toolCalls: allToolCalls.map((tc) => ({
              creditsUsed: tc.creditsUsed,
              durationMs: tc.durationMs,
              error: tc.error,
              parameters: tc.parameters ?? {},
              result: tc.resultSummary ? { summary: tc.resultSummary } : {},
              status: tc.status,
              toolName: tc.toolName,
            })),
            userId: context.userId,
          });

          let runDurationMs: number | undefined;
          if (context.runId) {
            const completedRun = await this.agentRunsService.complete(
              context.runId,
              context.organizationId,
              content.slice(0, 200),
            );
            runDurationMs =
              typeof completedRun?.durationMs === 'number'
                ? completedRun.durationMs
                : undefined;
          }

          await runEffectPromise(
            this.publishStreamCompletionEffect({
              completionMetadata: {
                isFallbackContent: normalizedContent.isFallback,
                memoryEntries: memoryEntriesForResponse,
                ...this.buildResolvedModelMetadata(
                  model,
                  Array.from(actualModels),
                ),
                reasoning,
                reviewRequired,
                riskLevel: highestRiskLevel,
                ...(enhancedUiActions.suggestedActions.length
                  ? { suggestedActions: enhancedUiActions.suggestedActions }
                  : {}),
                totalCreditsUsed,
                uiActions: enhancedUiActions.uiActions,
                ...(latestUiBlocks ? { uiBlocks: latestUiBlocks } : {}),
              },
              content,
              context,
              creditsRemaining,
              creditsUsed: totalCreditsUsed,
              durationMs: runDurationMs,
              runStartedAt,
              threadId,
              toolCalls: allToolCalls,
            }),
          );

          return;
        }

        // Has tool calls — execute them
        messages.push({
          content: assistantMessage.content,
          role: 'assistant' as const,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          if (await this.isRunCancelled(context)) {
            await this.handleCancelledStream(context, threadId);
            return;
          }

          const requestedToolName = toolCall.function.name as AgentToolName;
          let toolParams: Record<string, unknown> = {};
          try {
            toolParams = JSON.parse(toolCall.function.arguments);
          } catch {
            /* ignore parse errors */
          }

          let toolName = requestedToolName;

          if (!allowedToolNames.has(requestedToolName)) {
            const recoveredToolName = this.getUnknownToolRecovery(
              requestedToolName,
              allowedToolNames,
            );

            if (recoveredToolName) {
              toolName = recoveredToolName;
              toolParams = this.buildUnknownToolRecoveryParams(
                requestedToolName,
                toolParams,
              );

              this.loggerService.warn(
                `Recovered unknown tool ${requestedToolName} -> ${recoveredToolName}`,
                {
                  constructor: this.constructorName,
                  model,
                  organizationId: context.organizationId,
                  source: source ?? 'agent',
                  threadId,
                  toolName: requestedToolName,
                  userId: context.userId,
                },
              );
            }
          }

          const directGenerationOverride =
            this.getGenerationPreparationOverride(toolName, allowedToolNames);
          if (directGenerationOverride) {
            const originalToolName = toolName;
            toolName = directGenerationOverride;
            toolParams = this.buildUnknownToolRecoveryParams(
              originalToolName,
              toolParams,
            );

            this.loggerService.log(
              `Remapped direct generation tool ${originalToolName} -> ${directGenerationOverride}`,
              {
                organizationId: context.organizationId,
                source: source ?? 'agent',
                threadId,
                userId: context.userId,
              },
            );
          }

          const creditCost = AGENT_CREDIT_COSTS[toolName] ?? 0;
          const startTime = Date.now();

          await runEffectPromise(
            this.publishStreamingToolStartedEffect({
              context,
              parameters: toolParams,
              startedAt: new Date(startTime).toISOString(),
              threadId,
              toolCallId: toolCall.id,
              toolName,
            }),
          );

          if (!allowedToolNames.has(toolName)) {
            const unknownToolError = this.buildUnknownToolError(
              requestedToolName,
              allowedToolNames,
            );
            const durationMs = Date.now() - startTime;

            this.loggerService.warn(unknownToolError, {
              allowedToolsCount: allowedToolNames.size,
              constructor: this.constructorName,
              model,
              organizationId: context.organizationId,
              source: source ?? 'agent',
              threadId,
              toolName: requestedToolName,
              userId: context.userId,
            });

            const summary: ToolCallSummary = {
              creditsUsed: 0,
              durationMs,
              error: unknownToolError,
              status: 'failed',
              toolName: requestedToolName,
            };
            allToolCalls.push(summary);

            await runEffectPromise(
              this.publishStreamingToolCompletedEffect({
                context,
                debug: { error: summary.error, parameters: toolParams },
                detail: summary.error,
                durationMs: summary.durationMs,
                error: summary.error,
                label: requestedToolName,
                parameters: toolParams,
                resultSummary: summary.error,
                status: 'failed',
                threadId,
                toolCallId: toolCall.id,
                toolName: requestedToolName,
              }),
            );

            messages.push({
              content: JSON.stringify({
                availableTools: Array.from(allowedToolNames),
                error: unknownToolError,
                success: false,
              }),
              role: 'tool' as const,
              tool_call_id: toolCall.id,
            });
            continue;
          }

          // Check credits
          if (creditCost > 0) {
            const canAfford =
              await this.creditsUtilsService.checkOrganizationCreditsAvailable(
                context.organizationId,
                creditCost,
              );

            if (!canAfford) {
              const summary: ToolCallSummary = {
                creditsUsed: 0,
                durationMs: Date.now() - startTime,
                error: `Insufficient credits (need ${creditCost})`,
                status: 'failed',
                toolName,
              };
              allToolCalls.push(summary);

              await runEffectPromise(
                this.publishStreamingToolCompletedEffect({
                  context,
                  debug: { error: summary.error, parameters: toolParams },
                  detail: summary.error,
                  durationMs: summary.durationMs,
                  error: summary.error,
                  parameters: toolParams,
                  resultSummary: summary.error,
                  status: 'failed',
                  threadId,
                  toolCallId: toolCall.id,
                  toolName,
                }),
              );

              messages.push({
                content: JSON.stringify({
                  error: `Insufficient credits. This tool requires ${creditCost} credits.`,
                  success: false,
                }),
                role: 'tool' as const,
                tool_call_id: toolCall.id,
              });
              continue;
            }
          }

          // Execute tool
          const result = await this.toolExecutorService.executeTool(
            toolName,
            toolParams,
            {
              attachmentUrls: attachments?.map((a) => a.url),
              authToken: context.authToken,
              autonomyMode: resolvedPolicy.autonomyMode,
              brandId: resolvedPolicy.brandId,
              creditGovernance: resolvedPolicy.creditGovernance,
              generationModelOverride: resolvedPolicy.generationModelOverride,
              generationPriority,
              organizationId: context.organizationId,
              platform: resolvedPolicy.platform,
              qualityTier: resolvedPolicy.qualityTier,
              reviewModelOverride: resolvedPolicy.reviewModelOverride,
              runId: context.runId,
              strategyId: context.strategyId,
              thinkingModel: resolvedPolicy.thinkingModelOverride ?? undefined,
              threadId,
              userId: context.userId,
            },
          );

          if (await this.isRunCancelled(context)) {
            await this.handleCancelledStream(context, threadId);
            return;
          }

          const durationMs = Date.now() - startTime;

          if (result.nextActions?.length) {
            allUiActions.push(...result.nextActions);
          }

          if (result.requiresConfirmation) {
            reviewRequired = true;
          }
          if (result.riskLevel === 'high') {
            highestRiskLevel = 'high';
          } else if (
            result.riskLevel === 'medium' &&
            highestRiskLevel === 'low'
          ) {
            highestRiskLevel = 'medium';
          }

          if (result.success && creditCost > 0) {
            await this.creditsUtilsService.deductCreditsFromOrganization(
              context.organizationId,
              context.userId,
              creditCost,
              `Agent tool: ${toolName}`,
              ActivitySource.SCRIPT,
            );
            totalCreditsUsed += creditCost;
          }

          const summary: ToolCallSummary = {
            creditsUsed: result.success ? creditCost : 0,
            durationMs,
            error: result.error,
            parameters: toolParams,
            resultSummary: summarizeToolResult(result),
            status: result.success ? 'completed' : 'failed',
            toolName,
          };
          allToolCalls.push(summary);

          // Publish UI blocks from render_dashboard tool
          if (
            toolName === AgentToolName.RENDER_DASHBOARD &&
            result.data?.uiBlocks
          ) {
            const normalizedBlocks = this.normalizeUiBlocks(
              result.data.uiBlocks as unknown[],
            );
            latestUiBlocks = {
              blockIds: result.data.blockIds as string[] | undefined,
              blocks: normalizedBlocks,
              operation: result.data.operation as AgentDashboardOperation,
            };

            if (!result.data?.deferUiBlocksPublish) {
              await runEffectPromise(
                this.publishStreamUiBlocksEffect({
                  blockIds: result.data.blockIds as string[] | undefined,
                  blocks: normalizedBlocks as AgentUIBlocksEvent['blocks'],
                  context,
                  operation: result.data.operation as AgentDashboardOperation,
                  runId: context.runId,
                  threadId,
                }),
              );
            }
          }

          await runEffectPromise(
            this.publishStreamingToolCompletedEffect({
              context,
              creditsUsed: summary.creditsUsed,
              debug: summary.error
                ? {
                    error: summary.error,
                    parameters: toolParams,
                    result: result.data,
                  }
                : {
                    parameters: toolParams,
                    result: result.data,
                  },
              detail:
                summary.status === 'completed'
                  ? (summary.resultSummary ?? `${toolName} completed`)
                  : summary.error,
              durationMs,
              error: summary.error,
              parameters: toolParams,
              resultSummary: summary.resultSummary,
              status: summary.status,
              threadId,
              toolCallId: toolCall.id,
              toolName,
              uiActions: result.nextActions,
            }),
          );

          messages.push({
            content: JSON.stringify(result),
            role: 'tool' as const,
            tool_call_id: toolCall.id,
          });
        }
      }

      const errorMsg = `Agent exceeded maximum tool-calling rounds (${AGENT_MAX_TOOL_ROUNDS})`;
      await runEffectPromise(
        this.publishStreamFailureEffect({
          context,
          error: errorMsg,
          failRun: true,
          threadId,
        }),
      );
    } catch (error: unknown) {
      if (await this.isRunCancelled(context)) {
        await this.handleCancelledStream(context, threadId);
        return;
      }

      await runEffectPromise(
        this.publishStreamFailureEffect({
          context,
          error: error instanceof Error ? error.message : 'Unknown error',
          failRun: true,
          threadId,
        }),
      );

      this.loggerService.error(
        `${this.constructorName} streaming chat failed`,
        {
          error: error instanceof Error ? error.message : error,
          organizationId: context.organizationId,
          userId: context.userId,
        },
      );
    } finally {
      this.activeStreams.delete(threadId);
    }
  }

  private async isRunCancelled(context: AgentChatContext): Promise<boolean> {
    if (!context.runId) {
      return false;
    }

    return await this.agentRunsService.isCancelled(
      context.runId,
      context.organizationId,
    );
  }

  private async handleCancelledStream(
    context: AgentChatContext,
    threadId: string,
  ): Promise<void> {
    await runEffectPromise(
      this.publishStreamCancelledEffect(context, threadId),
    );
  }

  private async isFirstRun(organizationId: string): Promise<boolean> {
    const organization = await this.organizationsService.findOne({
      _id: organizationId,
      isDeleted: false,
    });

    // Explicitly check for false; missing field is treated as already onboarded.
    return organization?.onboardingCompleted === false;
  }

  private async resolveOrCreateThreadId(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<ThreadResolutionResult> {
    const existingThreadId = await this.findAccessibleThreadId(
      request.threadId,
      context.organizationId,
      context.userId,
    );

    if (existingThreadId) {
      return {
        seedTitle: '',
        threadId: existingThreadId,
      };
    }

    const seedTitle = this.buildSeedThreadTitle(request.content);

    const thread = await this.agentThreadsService.create({
      organization: context.organizationId,
      planModeEnabled: request.planModeEnabled ?? false,
      source: request.source || 'agent',
      title: seedTitle,
      user: context.userId,
    } as Record<string, unknown>);
    return {
      seedTitle,
      threadId: String(thread._id ?? thread.id),
    };
  }

  private async isPlanModeEnabledForThread(
    threadId: string,
    organizationId: string,
  ): Promise<boolean> {
    const thread = await this.agentThreadsService.findOne({
      _id: threadId,
      isDeleted: false,
      organization: organizationId,
    });

    return Boolean(
      (thread as { planModeEnabled?: boolean } | null)?.planModeEnabled,
    );
  }

  private buildSeedThreadTitle(content: string): string {
    return content.substring(0, 100).trim();
  }

  private buildFallbackThreadTitle(prompt: string): string {
    const fillerPattern =
      /\b(can you|could you|help me|i need|i want|please|let's|lets|show me|tell me|give me|make me|create|generate|draft|write)\b/gi;
    const cleaned = prompt
      .replace(/[`"'“”‘’]/g, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(fillerPattern, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleaned
      .split(' ')
      .filter((word) => word.length > 1)
      .slice(0, 5);

    if (words.length === 0) {
      return this.buildSeedThreadTitle(prompt);
    }

    return words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private sanitizeGeneratedThreadTitle(title: string, prompt: string): string {
    const normalized = title
      .replace(/[`"'“”‘’]/g, ' ')
      .replace(/[^\w\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return this.buildFallbackThreadTitle(prompt);
    }

    const words = normalized.split(' ').filter(Boolean).slice(0, 5);
    if (words.length < 2) {
      return this.buildFallbackThreadTitle(prompt);
    }

    return words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private extractThreadEnvelope(params: {
    assistantContent: string;
    prompt: string;
    seedTitle: string;
  }): { content: string; title: string | null } {
    if (!params.seedTitle.trim()) {
      return {
        content: params.assistantContent,
        title: null,
      };
    }

    const trimmed = params.assistantContent.trim();
    const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmed;
    let parsed: {
      content?: unknown;
      title?: unknown;
    } | null = null;

    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      try {
        parsed = JSON.parse(candidate) as {
          content?: unknown;
          title?: unknown;
        };
      } catch {
        parsed = null;
      }
    }

    const content =
      typeof parsed?.content === 'string' && parsed.content.trim()
        ? parsed.content.trim()
        : params.assistantContent;
    const parsedTitle =
      typeof parsed?.title === 'string' ? parsed.title.trim() : '';

    return {
      content,
      title: parsedTitle
        ? this.sanitizeGeneratedThreadTitle(parsedTitle, params.prompt)
        : this.buildFallbackThreadTitle(params.prompt),
    };
  }

  private async maybeUpdateThreadTitle(params: {
    context: AgentChatContext;
    seedTitle: string;
    threadId: string;
    title: string | null;
  }): Promise<void> {
    const seedTitle = params.seedTitle.trim();
    const nextTitle = params.title?.trim() ?? '';

    if (!seedTitle || !nextTitle || nextTitle === seedTitle) {
      return;
    }

    const thread = (await this.agentThreadsService.findOne({
      _id: params.threadId,
      isDeleted: false,
      organization: params.context.organizationId,
      user: {
        in: [params.context.userId],
      },
    })) as { title?: string } | null;

    const currentTitle =
      typeof thread?.title === 'string' ? thread.title.trim() : '';
    if (currentTitle !== seedTitle) {
      return;
    }

    await this.agentThreadsService.updateThreadMetadata(
      params.threadId,
      params.context.organizationId,
      { title: nextTitle },
    );
  }

  private async findAccessibleThreadId(
    threadId: string | undefined,
    organizationId: string,
    userId: string,
  ): Promise<string | null> {
    if (!isValidObjectId(threadId)) {
      return null;
    }

    const thread = await this.agentThreadsService.findOne({
      _id: threadId,
      isDeleted: false,
      organization: organizationId,
      user: { in: [userId] },
    });

    return thread ? String(thread._id ?? thread.id) : null;
  }

  private async resolveThreadUiActionModel(
    threadId: string,
    organizationId: string,
  ): Promise<string> {
    const binding = await runEffectPromise(
      this.getRuntimeBindingEffect(threadId, organizationId),
    );

    return binding?.model?.trim()
      ? binding.model.trim()
      : DEFAULT_AGENT_CHAT_MODEL;
  }

  private describeThreadUiAction(
    action: string,
    payload?: Record<string, unknown>,
  ): string {
    if (action === 'approve_plan') {
      const planId =
        typeof payload?.planId === 'string' && payload.planId.trim()
          ? payload.planId.trim()
          : 'current plan';

      return `Approved plan ${planId}.`;
    }

    if (action === 'revise_plan') {
      const note =
        typeof payload?.revisionNote === 'string' && payload.revisionNote.trim()
          ? payload.revisionNote.trim()
          : 'with requested changes';

      return `Requested plan changes: ${note}.`;
    }

    if (action === 'confirm_install_official_workflow') {
      const sourceName =
        typeof payload?.sourceName === 'string' && payload.sourceName.trim()
          ? payload.sourceName.trim()
          : 'official workflow';

      return `Confirmed install for ${sourceName}.`;
    }

    if (action === 'confirm_publish_post') {
      const contentId =
        typeof payload?.contentId === 'string' && payload.contentId.trim()
          ? payload.contentId.trim()
          : 'selected content';

      return `Confirmed publish for ${contentId}.`;
    }

    if (action === 'confirm_save_brand_voice_profile') {
      const brandId =
        typeof payload?.brandId === 'string' && payload.brandId.trim()
          ? payload.brandId.trim()
          : 'selected brand';

      return `Approved brand voice draft for ${brandId}.`;
    }

    return `Triggered thread UI action: ${action}`;
  }

  async resumeRecurringTaskDraftFromInput(params: {
    answer: string;
    fieldId?: string;
    organizationId: string;
    runId?: string;
    threadId: string;
    userId: string;
  }): Promise<void> {
    const binding = await runEffectPromise(
      this.getRuntimeBindingEffect(params.threadId, params.organizationId),
    );
    const resumeCursor = this.readRecurringTaskResumeCursor(
      binding?.resumeCursor as Record<string, unknown> | undefined,
    );

    if (!resumeCursor) {
      return;
    }

    const draft = { ...resumeCursor.draft };
    const fieldId = (params.fieldId ?? resumeCursor.awaitingField) as
      | RecurringTaskInputField
      | undefined;
    if (!fieldId) {
      return;
    }

    this.applyRecurringTaskAnswer(draft, fieldId, params.answer);

    const context: AgentChatContext = {
      organizationId: params.organizationId,
      runId: params.runId ?? binding?.runId,
      userId: params.userId,
    };

    const assistantResponse = await this.processRecurringTaskDraft({
      context,
      draft,
      model: binding?.model ?? DEFAULT_AGENT_CHAT_MODEL,
      threadId: params.threadId,
    });

    if (!assistantResponse) {
      return;
    }

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.organizationId,
      );

    await this.agentMessagesService.addMessage({
      content: assistantResponse.content,
      metadata: {
        ...assistantResponse.metadata,
        creditsRemaining,
      },
      organizationId: params.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.userId,
    });

    if (this.streamPublisher) {
      await runEffectPromise(
        this.publishStreamDoneOnlyEffect({
          content: assistantResponse.content,
          context,
          creditsRemaining,
          creditsUsed: assistantResponse.creditsUsed,
          metadata: assistantResponse.metadata,
          startedAt: new Date().toISOString(),
          threadId: params.threadId,
          toolCalls: [],
        }),
      );
    }
  }

  private async tryHandleRecurringTaskDraftTurn(params: {
    context: AgentChatContext;
    model: string;
    requestContent: string;
    seedTitle: string;
    threadId: string;
  }): Promise<AgentChatResult | null> {
    const assistantResponse =
      await this.prepareRecurringTaskDraftResponse(params);

    if (!assistantResponse) {
      return null;
    }

    await this.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: this.buildFallbackThreadTitle(params.requestContent),
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...assistantResponse.metadata,
      creditsRemaining,
      totalCreditsUsed: assistantResponse.creditsUsed,
    };

    await this.agentMessagesService.addMessage({
      content: assistantResponse.content,
      metadata: assistantMetadata,
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });
    await this.recordAssistantFinalized({
      content: assistantResponse.content,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await this.recordRunCompleted({
      context: params.context,
      detail: 'Recurring automation setup completed',
      runId: params.context.runId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: assistantResponse.creditsUsed,
      message: {
        content: assistantResponse.content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: [],
    };
  }

  private async tryHandlePlanModeTurn(params: {
    context: AgentChatContext;
    model: string;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }): Promise<AgentChatResult | null> {
    const isEnabled = await this.isPlanModeEnabledForThread(
      params.threadId,
      params.context.organizationId,
    );

    if (!isEnabled) {
      return null;
    }

    return await this.generatePlanModeResponse({
      context: params.context,
      model: params.model,
      request: params.request,
      resolvedMemories: params.resolvedMemories,
      seedTitle: params.seedTitle,
      systemPromptOverride: params.systemPromptOverride,
      threadId: params.threadId,
      turnCost: params.turnCost,
    });
  }

  private async tryHandlePlanModeTurnStream(params: {
    context: AgentChatContext;
    model: string;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    startedAt: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }): Promise<boolean> {
    const isEnabled = await this.isPlanModeEnabledForThread(
      params.threadId,
      params.context.organizationId,
    );

    if (!isEnabled) {
      return false;
    }

    const response = await this.generatePlanModeResponse({
      context: params.context,
      model: params.model,
      request: params.request,
      resolvedMemories: params.resolvedMemories,
      seedTitle: params.seedTitle,
      systemPromptOverride: params.systemPromptOverride,
      threadId: params.threadId,
      turnCost: params.turnCost,
    });

    await runEffectPromise(
      this.publishStreamDoneOnlyEffect({
        content: response.message.content,
        context: params.context,
        creditsRemaining: response.creditsRemaining,
        creditsUsed: response.creditsUsed,
        metadata: response.message.metadata,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: [],
      }),
    );

    return true;
  }

  private async generatePlanModeResponse(params: {
    context: AgentChatContext;
    model: string;
    reviewMetadata?: {
      lastReviewAction?: 'approve' | 'request_changes';
      revisionNote?: string;
    };
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }): Promise<AgentChatResult> {
    const { messages: recentMessages, compressedContext: planCompressedCtx } =
      await this.resolveThreadMessages(
        params.threadId,
        params.context.organizationId,
      );
    const history = this.buildMessageHistory(
      recentMessages,
      params.systemPromptOverride,
      params.resolvedMemories,
      params.request.attachments,
      planCompressedCtx,
    );

    const response = await this.llmDispatcher.chatCompletion(
      this.buildPlanningChatCompletionParams({
        messages: history,
        model: params.model,
        prompt: params.request.content,
        seedTitle: params.seedTitle,
        source: params.request.source,
      }),
      params.context.organizationId,
    );

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No planning response from LLM');
    }

    const envelope = this.extractPlanEnvelope({
      assistantContent: sanitizeAgentOutputText(choice.message.content || ''),
      prompt: params.request.content,
      seedTitle: params.seedTitle,
    });
    const plan = {
      ...envelope.plan,
      ...(params.reviewMetadata?.lastReviewAction
        ? { lastReviewAction: params.reviewMetadata.lastReviewAction }
        : {}),
      ...(params.reviewMetadata?.revisionNote
        ? { revisionNote: params.reviewMetadata.revisionNote }
        : {}),
    };

    await this.creditsUtilsService.deductCreditsFromOrganization(
      params.context.organizationId,
      params.context.userId,
      params.turnCost,
      `Agent planning turn (${params.model})`,
      ActivitySource.SCRIPT,
    );

    await this.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: envelope.title,
    });

    await this.recordPlanUpserted({
      context: params.context,
      plan,
      runId: params.context.runId,
      threadId: params.threadId,
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...this.buildRoutingMetadata({
        model: params.model,
        prompt: params.request.content,
        source: params.request.source,
      }),
      ...this.buildResolvedModelMetadata(params.model),
      proposedPlan: plan,
      reviewRequired: true,
      riskLevel: 'low' as const,
      totalCreditsUsed: params.turnCost,
    };
    const content =
      envelope.summary ||
      'I drafted a plan and paused here for your approval. Review it, then approve or request changes.';

    await this.agentMessagesService.addMessage({
      content,
      metadata: {
        creditsRemaining,
        ...assistantMetadata,
      },
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });
    await this.recordAssistantFinalized({
      content,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await this.recordRunCompleted({
      context: params.context,
      detail: 'Plan proposed and awaiting approval',
      runId: params.context.runId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: params.turnCost,
      message: {
        content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: [],
    };
  }

  private async tryHandleBatchGenerationTurnStream(params: {
    context: AgentChatContext;
    model: string;
    policy: ResolvedAgentExecutionPolicy;
    requestContent: string;
    seedTitle: string;
    startedAt: string;
    threadId: string;
  }): Promise<boolean> {
    const draft = this.extractBatchGenerationDraftFromMessage(
      params.requestContent,
      params.policy.brandId,
    );

    if (!draft) {
      return false;
    }

    const toolName = AgentToolName.GENERATE_CONTENT_BATCH;
    const toolCallId = `${params.context.runId ?? params.threadId}:batch`;
    const toolParams: Record<string, unknown> = {
      count: draft.count,
      dateRange: draft.dateRange,
      platforms: draft.platforms,
      ...(draft.brandId ? { brandId: draft.brandId } : {}),
      ...(draft.handle ? { handle: draft.handle } : {}),
      ...(draft.topics?.length ? { topics: draft.topics } : {}),
    };
    const startedAtIso = new Date().toISOString();
    const startTime = Date.now();

    await this.recordToolStarted({
      context: params.context,
      parameters: toolParams,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });
    await runEffectPromise(
      this.publishStreamingToolStartedEffect({
        context: params.context,
        detail: `Starting ${toolName}`,
        label: toolName,
        parameters: toolParams,
        progress: 10,
        startedAt: startedAtIso,
        threadId: params.threadId,
        toolCallId,
        toolName,
        workEventDetail: `Creating ${draft.count} post${draft.count === 1 ? '' : 's'} and streaming drafts as they finish.`,
        workEventLabel: 'Batch generation',
      }),
    );

    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolParams,
      {
        authToken: params.context.authToken,
        autonomyMode: params.policy.autonomyMode,
        brandId: params.policy.brandId,
        creditGovernance: params.policy.creditGovernance,
        generationModelOverride: params.policy.generationModelOverride,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        platform: params.policy.platform,
        qualityTier: params.policy.qualityTier,
        reviewModelOverride: params.policy.reviewModelOverride,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        streamBatchToUser: true,
        thinkingModel: params.policy.thinkingModelOverride ?? undefined,
        threadId: params.threadId,
        userId: params.context.userId,
      },
    );

    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
      parameters: toolParams,
      resultSummary:
        typeof result.data?.message === 'string'
          ? result.data.message
          : undefined,
      status: result.success ? 'completed' : 'failed',
      toolName,
    };

    await this.recordToolCompleted({
      context: params.context,
      durationMs,
      error: summary.error,
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });
    await runEffectPromise(
      this.publishStreamingToolCompletedEffect({
        context: params.context,
        creditsUsed: summary.creditsUsed,
        detail: summary.error ?? summary.resultSummary,
        durationMs,
        error: summary.error,
        label: toolName,
        parameters: toolParams,
        resultSummary: summary.resultSummary,
        status: summary.status,
        threadId: params.threadId,
        toolCallId,
        toolName,
      }),
    );

    if (!result.success) {
      await runEffectPromise(
        this.publishStreamErrorOnlyEffect(
          params.context,
          params.threadId,
          result.error ?? 'Batch generation failed',
        ),
      );
      return true;
    }

    const fullContent =
      typeof result.data?.streamedTranscript === 'string'
        ? result.data.streamedTranscript
        : typeof result.data?.message === 'string'
          ? result.data.message
          : 'Batch generation completed.';
    await this.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: this.buildFallbackThreadTitle(params.requestContent),
    });
    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const enhancedUiActions = this.buildAssistantUiActions({
      reviewRequired: result.requiresConfirmation ?? false,
      toolCalls: [{ status: summary.status, toolName }],
      uiActions: result.nextActions ?? [],
    });
    const assistantMetadata = {
      creditsRemaining,
      ...this.buildResolvedModelMetadata(params.model),
      reviewRequired: result.requiresConfirmation ?? false,
      riskLevel: result.riskLevel ?? 'low',
      ...(enhancedUiActions.suggestedActions.length
        ? { suggestedActions: enhancedUiActions.suggestedActions }
        : {}),
      totalCreditsUsed: result.creditsUsed ?? 0,
      uiActions: enhancedUiActions.uiActions,
    };

    await this.agentMessagesService.addMessage({
      content: fullContent,
      metadata: assistantMetadata,
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      toolCalls: [
        {
          creditsUsed: summary.creditsUsed,
          durationMs: summary.durationMs,
          error: summary.error,
          parameters: summary.parameters ?? {},
          result: summary.resultSummary
            ? { summary: summary.resultSummary }
            : {},
          status: summary.status,
          toolName,
        },
      ],
      userId: params.context.userId,
    });
    await this.recordAssistantFinalized({
      content: fullContent,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await this.recordRunCompleted({
      context: params.context,
      detail: 'Agent completed',
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await runEffectPromise(
      this.publishStreamDoneOnlyEffect({
        content: fullContent,
        context: params.context,
        creditsRemaining,
        creditsUsed: result.creditsUsed ?? 0,
        metadata: assistantMetadata,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: [summary],
      }),
    );

    return true;
  }

  private async tryHandleRecurringTaskDraftTurnStream(params: {
    context: AgentChatContext;
    model: string;
    requestContent: string;
    seedTitle: string;
    startedAt: string;
    threadId: string;
  }): Promise<boolean> {
    const assistantResponse =
      await this.prepareRecurringTaskDraftResponse(params);

    if (!assistantResponse) {
      return false;
    }

    await this.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: this.buildFallbackThreadTitle(params.requestContent),
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...assistantResponse.metadata,
      creditsRemaining,
      totalCreditsUsed: assistantResponse.creditsUsed,
    };

    await this.agentMessagesService.addMessage({
      content: assistantResponse.content,
      metadata: assistantMetadata,
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });

    await runEffectPromise(
      this.publishStreamDoneOnlyEffect({
        content: assistantResponse.content,
        context: params.context,
        creditsRemaining,
        creditsUsed: assistantResponse.creditsUsed,
        metadata: assistantMetadata,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: [],
      }),
    );

    return true;
  }

  private async prepareRecurringTaskDraftResponse(params: {
    context: AgentChatContext;
    model: string;
    requestContent: string;
    threadId: string;
  }): Promise<{
    content: string;
    creditsUsed: number;
    metadata: Record<string, unknown>;
  } | null> {
    const binding = await runEffectPromise(
      this.getRuntimeBindingEffect(
        params.threadId,
        params.context.organizationId,
      ),
    );
    const activeDraft = this.readRecurringTaskResumeCursor(
      binding?.resumeCursor as Record<string, unknown> | undefined,
    );
    const isRecurringIntent = this.isRecurringTaskIntent(params.requestContent);

    if (!activeDraft && !isRecurringIntent) {
      return null;
    }

    const defaultTimezone = await this.resolveOrganizationTimezone(
      params.context.organizationId,
    );
    const draft = activeDraft
      ? { ...activeDraft.draft }
      : this.extractRecurringTaskDraftFromMessage(
          params.requestContent,
          defaultTimezone,
        );

    return await this.processRecurringTaskDraft({
      context: params.context,
      draft,
      model: params.model,
      threadId: params.threadId,
    });
  }

  private async processRecurringTaskDraft(params: {
    context: AgentChatContext;
    draft: RecurringTaskDraft;
    model: string;
    threadId: string;
  }): Promise<{
    content: string;
    creditsUsed: number;
    metadata: Record<string, unknown>;
  } | null> {
    const missingField = this.getNextRecurringTaskField(params.draft);

    if (missingField) {
      await this.persistRecurringTaskDraft(
        params.threadId,
        params.context,
        params.draft,
        missingField,
      );
      await this.publishRecurringTaskInputRequest(
        params.threadId,
        params.context,
        params.draft,
        missingField,
      );

      return {
        content:
          missingField === 'prompt'
            ? 'I need the core generation brief before I create this recurring automation.'
            : missingField === 'schedule'
              ? 'I need the cadence for this recurring automation before I create it.'
              : 'I need one more creative constraint so each run stays useful instead of producing near-duplicates.',
        creditsUsed: 0,
        metadata: this.buildResolvedModelMetadata(params.model),
      };
    }

    const result = await this.toolExecutorService.executeTool(
      AgentToolName.CREATE_WORKFLOW,
      {
        contentType: params.draft.contentType,
        count: params.draft.count,
        diversityMode: params.draft.diversityMode ?? 'medium',
        label: params.draft.workflowLabel,
        negativePrompt: params.draft.negativePrompt,
        prompt: params.draft.prompt,
        schedule: params.draft.schedule,
        styleNotes: params.draft.styleNotes,
        timezone: params.draft.timezone,
      },
      {
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        threadId: params.threadId,
        userId: params.context.userId,
      },
    );

    await this.persistRecurringTaskDraft(
      params.threadId,
      params.context,
      params.draft,
      undefined,
      new Date().toISOString(),
    );

    return {
      content: result.success
        ? 'Recurring automation created.'
        : (result.error ?? 'Failed to create the recurring automation.'),
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      metadata: result.success
        ? (() => {
            const enhancedUiActions = this.buildAssistantUiActions({
              reviewRequired: result.requiresConfirmation ?? false,
              toolCalls: [
                {
                  status: 'completed',
                  toolName: AgentToolName.CREATE_WORKFLOW,
                },
              ],
              uiActions: result.nextActions ?? [],
            });

            return {
              ...this.buildResolvedModelMetadata(params.model),
              reviewRequired: result.requiresConfirmation ?? false,
              riskLevel: result.riskLevel ?? 'low',
              ...(enhancedUiActions.suggestedActions.length
                ? { suggestedActions: enhancedUiActions.suggestedActions }
                : {}),
              uiActions: enhancedUiActions.uiActions,
            };
          })()
        : this.buildResolvedModelMetadata(params.model),
    };
  }

  private async publishRecurringTaskInputRequest(
    threadId: string,
    context: AgentChatContext,
    draft: RecurringTaskDraft,
    fieldId: RecurringTaskInputField,
  ): Promise<void> {
    if (!this.streamPublisher) {
      return;
    }

    const inputRequestId = `recurring-workflow:${threadId}:${fieldId}:${Date.now()}`;
    const config =
      fieldId === 'prompt'
        ? {
            allowFreeText: true,
            prompt:
              'What should these assets actually communicate or promote? Be specific about the product, campaign, or offer.',
            title: 'Define the recurring brief',
          }
        : fieldId === 'schedule'
          ? {
              allowFreeText: true,
              prompt:
                'What cadence should this run on? Example: every day at 5pm or every weekday at 9am.',
              title: 'Confirm the schedule',
            }
          : {
              allowFreeText: true,
              options: [
                {
                  description:
                    'Best default for recurring social batches with one campaign direction.',
                  id: 'same-campaign-varied-concepts',
                  label:
                    'Keep the campaign consistent, vary concept and composition',
                },
                {
                  description:
                    'Use this when you want stronger novelty between each asset in a run.',
                  id: 'distinct-directions',
                  label: 'Push each asset into a more distinct direction',
                },
              ],
              prompt:
                'What should stay consistent across the batch, and what should vary between each asset?',
              recommendedOptionId: 'same-campaign-varied-concepts',
              title: 'Set the variation strategy',
            };

    await this.persistRecurringTaskDraft(
      threadId,
      context,
      draft,
      fieldId,
      undefined,
      inputRequestId,
    );

    await runEffectPromise(
      this.publishStreamInputRequestEffect({
        ...config,
        context,
        fieldId,
        inputRequestId,
        metadata: {
          flow: 'recurring_workflow_setup',
        },
        runId: context.runId,
        threadId,
      }),
    );
  }

  private async persistRecurringTaskDraft(
    threadId: string,
    context: AgentChatContext,
    draft: RecurringTaskDraft,
    awaitingField?: RecurringTaskInputField,
    completedAt?: string,
    lastRequestId?: string,
  ): Promise<void> {
    const resumeCursor: RecurringTaskResumeCursor = {
      ...(awaitingField ? { awaitingField } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(lastRequestId ? { lastRequestId } : {}),
      draft,
      kind: 'recurring_workflow_setup',
      updatedAt: new Date().toISOString(),
    };

    await runEffectPromise(
      this.upsertRuntimeBindingEffect({
        organizationId: context.organizationId,
        resumeCursor,
        runId: context.runId,
        status: completedAt
          ? 'completed'
          : awaitingField
            ? 'waiting_input'
            : 'running',
        threadId,
      }),
    );
  }

  private readRecurringTaskResumeCursor(
    resumeCursor: Record<string, unknown> | undefined,
  ): RecurringTaskResumeCursor | null {
    if (!resumeCursor || resumeCursor.kind !== 'recurring_workflow_setup') {
      return null;
    }

    const draft = resumeCursor.draft;
    if (!draft || typeof draft !== 'object') {
      return null;
    }

    return resumeCursor as RecurringTaskResumeCursor;
  }

  private isRecurringTaskIntent(content: string): boolean {
    const normalized = content.toLowerCase();
    const hasRecurringSignal =
      normalized.includes('every day') ||
      normalized.includes('daily') ||
      normalized.includes('every week') ||
      normalized.includes('weekly') ||
      normalized.includes('recurring');
    const hasAssetSignal = /(image|video|post|newsletter)/.test(normalized);

    return hasRecurringSignal && hasAssetSignal;
  }

  private extractRecurringTaskDraftFromMessage(
    content: string,
    defaultTimezone: string,
  ): RecurringTaskDraft {
    const normalized = content.toLowerCase();
    const countMatch = normalized.match(
      /\b(\d{1,2})\s+(?:instagram|tiktok|linkedin|x|twitter|facebook)?\s*(images?|videos?|posts?|newsletters?)\b/,
    );
    const contentType = normalized.includes('video')
      ? 'video'
      : normalized.includes('newsletter')
        ? 'newsletter'
        : normalized.includes('post')
          ? 'post'
          : 'image';
    const platformMatch = normalized.match(
      /\b(instagram|tiktok|linkedin|x|twitter|facebook)\b/,
    );
    const parsedSchedule = this.extractCronScheduleFromMessage(normalized);

    return {
      contentType,
      count: countMatch ? Number.parseInt(countMatch[1], 10) : 1,
      diversityMode: normalized.includes('distinct')
        ? 'high'
        : normalized.includes('consistent')
          ? 'low'
          : 'medium',
      platform: platformMatch?.[1],
      prompt: this.extractRecurringPromptFromMessage(content),
      schedule: parsedSchedule?.schedule,
      styleNotes: this.extractStyleNotesFromMessage(content),
      timezone: parsedSchedule?.timezone ?? defaultTimezone,
    };
  }

  private extractRecurringPromptFromMessage(
    content: string,
  ): string | undefined {
    const cleaned = content
      .replace(/\bcreate\b/gi, '')
      .replace(/\bmake\b/gi, '')
      .replace(/\bgenerate\b/gi, '')
      .replace(/\bset up\b/gi, '')
      .replace(/\brecurring\b/gi, '')
      .replace(/\bfor instagram\b/gi, '')
      .replace(/\bon instagram\b/gi, '')
      .replace(/\binstagram\b/gi, '')
      .replace(/\bfor tiktok\b/gi, '')
      .replace(/\bon tiktok\b/gi, '')
      .replace(/\btiktok\b/gi, '')
      .replace(/\bfor linkedin\b/gi, '')
      .replace(/\bon linkedin\b/gi, '')
      .replace(/\blinkedin\b/gi, '')
      .replace(/\bfor facebook\b/gi, '')
      .replace(/\bon facebook\b/gi, '')
      .replace(/\bfacebook\b/gi, '')
      .replace(/\bfor twitter\b/gi, '')
      .replace(/\bon twitter\b/gi, '')
      .replace(/\btwitter\b/gi, '')
      .replace(/\bfor x\b/gi, '')
      .replace(/\bon x\b/gi, '')
      .replace(/\bx\b/gi, '')
      .replace(/\b\d{1,2}\s+(images?|videos?|posts?|newsletters?)\b/gi, '')
      .replace(/\bimages?\b/gi, '')
      .replace(/\bvideos?\b/gi, '')
      .replace(/\bposts?\b/gi, '')
      .replace(/\bnewsletters?\b/gi, '')
      .replace(
        /\b(?:every day|daily|every weekday|weekdays|each month|every month|every week|weekly)(?:.*)$/i,
        '',
      )
      .replace(/\bin\s+an?\s+.+?\s+style\b/gi, '')
      .replace(/\bwith\s+an?\s+.+?\s+style\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(for|about|around)\s+/i, '');

    return cleaned.length >= 8 ? cleaned : undefined;
  }

  private extractStyleNotesFromMessage(content: string): string | undefined {
    const styleMatch = content.match(/\b(?:in|with)\s+an?\s+(.+?)\s+style\b/i);
    return styleMatch?.[1]?.trim();
  }

  private extractCronScheduleFromMessage(
    content: string,
  ): ParsedRecurringSchedule | null {
    const timezone = this.extractTimezoneFromMessage(content);
    const extractTime = (
      match: RegExpMatchArray,
    ): { hour: number; minute: number } => {
      const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
      let hour = Number.parseInt(match[1], 10);
      const meridiem = match[3];

      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return { hour, minute };
    };

    const dailyMatch = content.match(
      /\b(?:every day|daily)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );

    if (dailyMatch) {
      const { hour, minute } = extractTime(dailyMatch);
      return { schedule: `${minute} ${hour} * * *`, timezone };
    }

    const weekdayMatch = content.match(
      /\b(?:every weekday|weekdays)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    if (weekdayMatch) {
      const { hour, minute } = extractTime(weekdayMatch);
      return { schedule: `${minute} ${hour} * * 1-5`, timezone };
    }

    const weeklyMatch = content.match(
      /\b(?:every|each)(?:\s+week)?\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    if (weeklyMatch) {
      const weekdayMap: Record<string, number> = {
        friday: 5,
        monday: 1,
        saturday: 6,
        sunday: 0,
        thursday: 4,
        tuesday: 2,
        wednesday: 3,
      };
      const minute = weeklyMatch[3] ? Number.parseInt(weeklyMatch[3], 10) : 0;
      let hour = Number.parseInt(weeklyMatch[2], 10);
      const meridiem = weeklyMatch[4];
      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return {
        schedule: `${minute} ${hour} * * ${weekdayMap[weeklyMatch[1]]}`,
        timezone,
      };
    }

    const monthlyMatch = content.match(
      /\b(?:every|each)\s+month(?:\s+on)?\s+(?:day\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    if (monthlyMatch) {
      const minute = monthlyMatch[3] ? Number.parseInt(monthlyMatch[3], 10) : 0;
      let hour = Number.parseInt(monthlyMatch[2], 10);
      const meridiem = monthlyMatch[4];
      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return {
        schedule: `${minute} ${hour} ${monthlyMatch[1]} * *`,
        timezone,
      };
    }

    return null;
  }

  private extractTimezoneFromMessage(content: string): string | undefined {
    const ianaMatch = content.match(/\b([a-z]+\/[a-z_]+(?:\/[a-z_]+)?)\b/i);
    if (ianaMatch?.[1]) {
      return ianaMatch[1];
    }

    const timezoneAliases: Record<string, string> = {
      cet: 'Europe/Paris',
      cst: 'America/Chicago',
      est: 'America/New_York',
      london: 'Europe/London',
      malta: 'Europe/Malta',
      paris: 'Europe/Paris',
      pst: 'America/Los_Angeles',
      utc: 'UTC',
    };

    for (const timezone of TIMEZONES) {
      const normalizedLabel = timezone.label.toLowerCase();
      if (
        content.includes(timezone.value.toLowerCase()) ||
        content.includes(normalizedLabel.split(' ')[0])
      ) {
        return timezone.value;
      }
    }

    for (const [alias, resolvedTimezone] of Object.entries(timezoneAliases)) {
      if (new RegExp(`\\b${alias}\\b`, 'i').test(content)) {
        return resolvedTimezone;
      }
    }

    return undefined;
  }

  private getNextRecurringTaskField(
    draft: RecurringTaskDraft,
  ): RecurringTaskInputField | null {
    if (!draft.prompt?.trim()) {
      return 'prompt';
    }
    if (!draft.schedule?.trim()) {
      return 'schedule';
    }
    if (!draft.styleNotes?.trim()) {
      return 'variationBrief';
    }
    return null;
  }

  private applyRecurringTaskAnswer(
    draft: RecurringTaskDraft,
    fieldId: RecurringTaskInputField,
    answer: string,
  ): void {
    const normalized = answer.trim();

    if (!normalized) {
      return;
    }

    if (fieldId === 'prompt') {
      draft.prompt = normalized;
      return;
    }

    if (fieldId === 'schedule') {
      const parsedSchedule = this.extractCronScheduleFromMessage(
        normalized.toLowerCase(),
      );
      draft.schedule = parsedSchedule?.schedule ?? normalized;
      draft.timezone = parsedSchedule?.timezone ?? draft.timezone;
      return;
    }

    draft.styleNotes = normalized;
    if (/distinct|different|varied|variety|novel|vary/i.test(normalized)) {
      draft.diversityMode = 'high';
    } else if (/consistent|same campaign|tight/i.test(normalized)) {
      draft.diversityMode = 'low';
    } else {
      draft.diversityMode = draft.diversityMode ?? 'medium';
    }
  }

  private async resolveOrganizationTimezone(
    organizationId: string,
  ): Promise<string> {
    const organization = await this.organizationsService.findOne({
      _id: organizationId,
      isDeleted: false,
    });
    const settings = organization?.settings as
      | { timezone?: string }
      | undefined;

    return settings?.timezone?.trim() || 'UTC';
  }

  private async resolveSystemPromptAndModel(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<{
    model: string | undefined;
    policy: ResolvedAgentExecutionPolicy;
    resolvedSkills: ResolvedRuntimeSkill[];
    systemPrompt: string | undefined;
    memories: AgentMemoryDocument[];
  }> {
    const shouldUseOnboardingPrompt = request.source === 'onboarding';
    const strategy = context.strategyId
      ? await this.agentStrategiesService.findOneById(
          context.strategyId,
          context.organizationId,
        )
      : null;
    const agentTypeConfig = request.agentType
      ? getAgentTypeConfig(request.agentType)
      : null;
    const orgSettings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: context.organizationId,
    });
    const { policy, strategyModel } = resolveEffectiveAgentExecutionConfig({
      organizationSettings: orgSettings,
      strategy,
    });

    let thread: {
      systemPrompt?: string;
      memoryEntryIds?: string[];
    } | null = null;

    if (isValidObjectId(request.threadId)) {
      thread = (await this.agentThreadsService.findOne({
        _id: request.threadId,
        isDeleted: false,
        organization: context.organizationId,
      })) as { systemPrompt?: string; memoryEntryIds?: string[] } | null;
    }

    const memories = await this.agentMemoriesService.getMemoriesForPrompt(
      context.userId,
      context.organizationId,
      {
        campaignId: context.campaignId,
        contentType: this.inferMemoryContentType(request.content),
        limit: 8,
        pinnedMemoryIds: thread?.memoryEntryIds,
        query: request.content,
      },
    );

    const replyStyle = orgSettings?.agentReplyStyle;
    const subscriptionDefaultModel =
      !request.model &&
      !strategyModel &&
      !policy.thinkingModelOverride &&
      PAID_SUBSCRIPTION_TIERS.has(orgSettings?.subscriptionTier ?? '')
        ? LOCAL_DEFAULT_AGENT_CHAT_MODEL
        : undefined;
    const shouldLoadBrandContext =
      Boolean(policy.brandId) ||
      (!thread?.systemPrompt && !request.systemPromptOverride);
    const brandContext = shouldLoadBrandContext
      ? await this.contextAssemblyService.assembleContext({
          brandId: policy.brandId,
          layers: {
            brandGuidance: true,
            brandIdentity: true,
            brandMemory: true,
          },
          organizationId: context.organizationId,
          platform: policy.platform,
        })
      : null;
    const resolveModel = (brandDefaultModel?: string): string | undefined =>
      request.model ||
      strategyModel ||
      policy.thinkingModelOverride ||
      subscriptionDefaultModel ||
      brandDefaultModel ||
      agentTypeConfig?.defaultModel ||
      DEFAULT_AGENT_CHAT_MODEL;

    // Resolve active skills for this brand + strategy
    const resolvedSkills =
      this.skillRuntimeService && policy.brandId
        ? await this.skillRuntimeService.resolveActiveSkills(
            context.organizationId,
            policy.brandId,
            strategy?.skillSlugs,
          )
        : [];
    const skillPromptSuffix = this.skillRuntimeService
      ? this.skillRuntimeService.buildSkillPromptSections(resolvedSkills)
      : '';

    if (shouldUseOnboardingPrompt) {
      return {
        memories,
        model: resolveModel(),
        policy,
        resolvedSkills,
        systemPrompt: ONBOARDING_SYSTEM_PROMPT,
      };
    }

    if (thread?.systemPrompt) {
      const prompt = skillPromptSuffix
        ? `${thread.systemPrompt}\n\n${skillPromptSuffix}`
        : thread.systemPrompt;
      return {
        memories,
        model: resolveModel(brandContext?.defaultModel),
        policy,
        resolvedSkills,
        systemPrompt: prompt,
      };
    }

    if (request.systemPromptOverride) {
      const prompt = skillPromptSuffix
        ? `${request.systemPromptOverride}\n\n${skillPromptSuffix}`
        : request.systemPromptOverride;
      return {
        memories,
        model: resolveModel(brandContext?.defaultModel),
        policy,
        resolvedSkills,
        systemPrompt: prompt,
      };
    }
    const typeSuffix = agentTypeConfig?.systemPromptSuffix ?? '';
    const platformSuffix =
      !typeSuffix && request.content
        ? detectPlatformIntentSuffix(request.content)
        : '';
    const basePrompt =
      SYSTEM_PROMPT +
      (typeSuffix || platformSuffix) +
      (skillPromptSuffix ? `\n\n${skillPromptSuffix}` : '');

    if (brandContext) {
      const systemPrompt = this.contextAssemblyService.buildSystemPrompt(
        basePrompt,
        brandContext,
        { replyStyle },
      );
      return {
        memories,
        model: resolveModel(brandContext.defaultModel),
        policy,
        resolvedSkills,
        systemPrompt,
      };
    }

    if (replyStyle || agentTypeConfig?.systemPromptSuffix) {
      const styleMap: Record<string, string> = {
        concise:
          'Be brief and to the point. Short sentences, no fluff. No emoji.',
        detailed:
          'Provide thorough explanations with context and examples. No emoji.',
        friendly:
          'Be warm, clear, and conversational while staying professional. Use simple language. No emoji.',
        professional: 'Maintain a formal, business-appropriate tone. No emoji.',
      };
      const instruction = replyStyle
        ? (styleMap[replyStyle] ?? styleMap.concise)
        : null;
      const systemPrompt = instruction
        ? `${basePrompt}\n\n## Reply Style\n${instruction}`
        : basePrompt;
      return {
        memories,
        model: resolveModel(),
        policy,
        resolvedSkills,
        systemPrompt,
      };
    }

    return {
      memories,
      model: resolveModel(),
      policy,
      resolvedSkills,
      systemPrompt: agentTypeConfig?.systemPromptSuffix
        ? basePrompt
        : undefined,
    };
  }

  private buildMessageHistory(
    messages: AgentMessageDocument[],
    systemPromptOverride?: string,
    memories?: AgentMemoryDocument[],
    attachments?: AgentChatAttachment[],
    compressedThreadContext?: string,
  ): OpenRouterMessage[] {
    const systemPrompt = (systemPromptOverride || SYSTEM_PROMPT).replace(
      '{{date}}',
      new Date().toISOString().split('T')[0],
    );

    const history: OpenRouterMessage[] = [
      { content: systemPrompt, role: 'system' },
    ];

    if (memories && memories.length > 0) {
      const preview = this.buildMemoryPromptSections(memories);

      if (preview) {
        history.push({
          content: preview,
          role: 'system',
        });
      }
    }

    // Inject compressed thread context as a user message if available
    if (compressedThreadContext) {
      history.push({
        content: compressedThreadContext,
        role: 'user',
      });
    }

    // Messages are already limited by getRecentMessages() or getMessagesAfter()
    const lastUserIndex = this.findLastUserMessageIndex(messages);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (
        msg.role === AgentMessageRole.USER ||
        msg.role === AgentMessageRole.ASSISTANT
      ) {
        const isLatestUserMessage =
          i === lastUserIndex && msg.role === AgentMessageRole.USER;

        if (isLatestUserMessage && attachments?.length) {
          history.push({
            content: [
              { text: msg.content || '', type: 'text' },
              ...attachments.map((a) => ({
                image_url: { url: a.url },
                type: 'image_url' as const,
              })),
            ],
            role: 'user',
          });
        } else {
          history.push({
            content: msg.content || '',
            role: msg.role as 'user' | 'assistant',
          });
        }
      }
    }

    return history;
  }

  /**
   * Resolve messages and optional compressed context for a thread.
   * If compaction is available, returns windowed messages + compressed context.
   * Otherwise falls back to the standard getRecentMessages(20).
   */
  private async resolveThreadMessages(
    threadId: string,
    organizationId: string,
  ): Promise<{
    messages: AgentMessageDocument[];
    compressedContext?: string;
  }> {
    if (!this.threadContextCompressorService) {
      return {
        messages: await this.agentMessagesService.getRecentMessages(threadId),
      };
    }

    const state = await this.threadContextCompressorService.getStateOrCompact(
      threadId,
      organizationId,
    );

    if (!state) {
      return {
        messages: await this.agentMessagesService.getRecentMessages(threadId),
      };
    }

    const windowMessages =
      await this.threadContextCompressorService.getWindowMessages(
        threadId,
        state.data.lastIncorporatedMessageId ?? '',
      );

    const compressedContext =
      this.threadContextCompressorService.renderStateAsUserMessage(
        state,
        windowMessages,
      );

    return { compressedContext, messages: windowMessages };
  }

  private findLastUserMessageIndex(messages: AgentMessageDocument[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === AgentMessageRole.USER) {
        return i;
      }
    }
    return -1;
  }

  private buildToolDefinitions(
    allowedTools?: AgentToolName[],
  ): OpenRouterTool[] {
    const all = getToolDefinitions();
    const filtered = allowedTools
      ? all.filter((t) => allowedTools.includes(t.name as AgentToolName))
      : all;

    return filtered.map((tool) => ({
      function: {
        description: tool.description,
        name: tool.name,
        parameters: tool.parameters,
      },
      type: 'function' as const,
    }));
  }

  private mergeAllowedTools(
    preferred?: AgentToolName[],
    scoped?: AgentToolName[],
  ): AgentToolName[] | undefined {
    if (preferred && scoped) {
      return preferred.filter((tool) => scoped.includes(tool));
    }

    return scoped ?? preferred;
  }

  private getRequestScopedAllowedTools(
    requestContent: string,
  ): AgentToolName[] | undefined {
    if (!this.isBatchGenerationIntent(requestContent)) {
      return undefined;
    }

    return [
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.BATCH_APPROVE_REJECT,
      AgentToolName.GET_CURRENT_BRAND,
      AgentToolName.LIST_BRANDS,
      AgentToolName.LIST_REVIEW_QUEUE,
    ];
  }

  private isBatchGenerationIntent(content: string): boolean {
    const normalized = content.toLowerCase();

    return (
      /\b(generate|create|make|write|draft)\b/.test(normalized) &&
      /\b\d+\s+(posts?|tweets?|drafts?)\b/.test(normalized)
    );
  }

  private extractBatchGenerationDraftFromMessage(
    content: string,
    fallbackBrandId?: string | null,
  ): BatchGenerationDraft | null {
    if (!this.isBatchGenerationIntent(content)) {
      return null;
    }

    const normalized = content.toLowerCase();
    const countMatch = normalized.match(/\b(\d+)\s+(posts?|tweets?|drafts?)\b/);
    const count = Number.parseInt(countMatch?.[1] ?? '', 10);

    if (!Number.isFinite(count) || count <= 0) {
      return null;
    }

    const handle = content.match(/@\w[\w.]{1,}/)?.[0];

    if (!handle && !fallbackBrandId) {
      return null;
    }

    const topics = this.extractBatchTopics(content, normalized);

    return {
      brandId: fallbackBrandId ?? undefined,
      count,
      dateRange: this.resolveBatchDateRange(normalized),
      handle,
      platforms: this.extractBatchPlatforms(normalized, countMatch?.[2]),
      ...(topics.length > 0 ? { topics } : {}),
    };
  }

  private extractBatchPlatforms(
    normalizedContent: string,
    noun?: string,
  ): string[] {
    if (
      noun?.startsWith('tweet') ||
      /\b(?:for|on)\s+(?:x|twitter)\b/.test(normalizedContent)
    ) {
      return ['twitter'];
    }

    if (/\b(?:for|on)\s+linkedin\b/.test(normalizedContent)) {
      return ['linkedin'];
    }

    if (/\b(?:for|on)\s+instagram\b/.test(normalizedContent)) {
      return ['instagram'];
    }

    return ['twitter'];
  }

  private extractBatchTopics(
    originalContent: string,
    normalizedContent: string,
  ): string[] {
    const aboutMatch = normalizedContent.match(
      /\babout\s+(.+?)(?:\s+(?:for|on|this|next|over)\b|[.!?]|$)/,
    );

    if (!aboutMatch) {
      return [];
    }

    const startIndex = aboutMatch.index ?? -1;
    if (startIndex < 0) {
      return [];
    }

    const originalSlice = originalContent.slice(
      startIndex + 'about '.length,
      startIndex + 'about '.length + aboutMatch[1].length,
    );
    const topic = originalSlice.trim();

    return topic ? [topic] : [];
  }

  private resolveBatchDateRange(normalizedContent: string): {
    end: string;
    start: string;
  } {
    const start = new Date();
    const end = new Date(start);

    if (/\bthis month\b/.test(normalizedContent)) {
      end.setDate(end.getDate() + 30);
    } else if (/\bnext month\b/.test(normalizedContent)) {
      start.setMonth(start.getMonth() + 1, 1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
      end.setDate(end.getDate() - 1);
    } else if (/\bnext week\b/.test(normalizedContent)) {
      start.setDate(start.getDate() + 7);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
    } else {
      end.setDate(end.getDate() + 7);
    }

    return {
      end: end.toISOString(),
      start: start.toISOString(),
    };
  }

  private buildUnknownToolError(
    toolName: string,
    allowedTools: Set<AgentToolName>,
  ): string {
    const knownTools = Array.from(allowedTools).sort();
    const maxPreview = 15;
    const preview = knownTools.slice(0, maxPreview).join(', ');
    const suffix = knownTools.length > maxPreview ? ', ...' : '';

    return `Unknown tool requested by model: ${toolName}. Available tools: ${preview}${suffix}`;
  }

  private getUnknownToolRecovery(
    toolName: AgentToolName,
    allowedTools: Set<AgentToolName>,
  ): AgentToolName | null {
    const canPrepareGeneration = allowedTools.has(
      AgentToolName.PREPARE_GENERATION,
    );
    const isRecoverableGenerationTool =
      toolName === AgentToolName.GENERATE_IMAGE ||
      toolName === AgentToolName.GENERATE_VIDEO ||
      toolName === AgentToolName.GENERATE_AS_IDENTITY;

    if (canPrepareGeneration && isRecoverableGenerationTool) {
      return AgentToolName.PREPARE_GENERATION;
    }

    return null;
  }

  private getGenerationPreparationOverride(
    toolName: AgentToolName,
    allowedTools: Set<AgentToolName>,
  ): AgentToolName | null {
    const canPrepareGeneration = allowedTools.has(
      AgentToolName.PREPARE_GENERATION,
    );
    const isDirectGenerationTool =
      toolName === AgentToolName.GENERATE_IMAGE ||
      toolName === AgentToolName.GENERATE_VIDEO ||
      toolName === AgentToolName.GENERATE_AS_IDENTITY;

    if (canPrepareGeneration && isDirectGenerationTool) {
      return AgentToolName.PREPARE_GENERATION;
    }

    return null;
  }

  private buildUnknownToolRecoveryParams(
    requestedToolName: AgentToolName,
    toolParams: Record<string, unknown>,
  ): Record<string, unknown> {
    if (
      requestedToolName !== AgentToolName.GENERATE_IMAGE &&
      requestedToolName !== AgentToolName.GENERATE_VIDEO &&
      requestedToolName !== AgentToolName.GENERATE_AS_IDENTITY
    ) {
      return toolParams;
    }

    const prompt =
      (toolParams.prompt as string | undefined) ||
      (toolParams.description as string | undefined) ||
      (toolParams.text as string | undefined) ||
      '';

    return {
      ...toolParams,
      generationType:
        requestedToolName === AgentToolName.GENERATE_IMAGE ? 'image' : 'video',
      prompt,
    };
  }

  private async executeConfirmedInstallOfficialWorkflowAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const toolName = 'install_official_workflow' as AgentToolName;
    const toolPayload = {
      ...(params.payload ?? {}),
      confirmed: true,
    };
    const startTime = Date.now();

    await this.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });

    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        authToken: params.context.authToken,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
      },
    );
    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
      status: result.success ? 'completed' : 'failed',
      toolName,
    };

    await this.recordToolCompleted({
      context: params.context,
      durationMs,
      error: summary.error,
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });

    if (!result.success) {
      const errorMessage =
        result.error ?? 'Failed to execute workflow install confirmation.';
      throw new InternalServerErrorException(errorMessage);
    }

    return await this.finalizeStructuredAssistantTurn({
      content: 'Official workflow installed.',
      context: params.context,
      model: params.model,
      result,
      threadId: params.threadId,
      toolCalls: [summary],
    });
  }

  private async executeConfirmedPublishPostAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const toolName = AgentToolName.CREATE_POST;
    const toolPayload = {
      ...(params.payload ?? {}),
      confirmed: true,
    };
    const startTime = Date.now();

    await this.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });

    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        authToken: params.context.authToken,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
      },
    );
    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
      status: result.success ? 'completed' : 'failed',
      toolName,
    };

    await this.recordToolCompleted({
      context: params.context,
      durationMs,
      error: summary.error,
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });

    if (!result.success) {
      const errorMessage = result.error ?? 'Failed to publish content.';
      throw new InternalServerErrorException(errorMessage);
    }

    const totalCreated =
      typeof result.data?.totalCreated === 'number'
        ? result.data.totalCreated
        : 0;
    const scheduledAt =
      typeof result.data?.scheduledAt === 'string' &&
      result.data.scheduledAt.trim()
        ? result.data.scheduledAt.trim()
        : null;
    const createdPlatforms = Array.isArray(result.data?.createdPlatforms)
      ? (result.data.createdPlatforms as string[])
      : [];
    const platformSummary =
      createdPlatforms.length > 0 ? ` on ${createdPlatforms.join(', ')}` : '';
    const content = scheduledAt
      ? `Scheduled ${totalCreated} post${totalCreated === 1 ? '' : 's'}${platformSummary}.`
      : `Queued ${totalCreated} post${totalCreated === 1 ? '' : 's'}${platformSummary} for publishing.`;

    return await this.finalizeStructuredAssistantTurn({
      content,
      context: params.context,
      model: params.model,
      result,
      threadId: params.threadId,
      toolCalls: [summary],
    });
  }

  private async executeConfirmedSaveBrandVoiceProfileAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const toolName = 'save_brand_voice_profile' as AgentToolName;
    const toolPayload = {
      ...(params.payload ?? {}),
    };
    const startTime = Date.now();

    await this.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });

    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        authToken: params.context.authToken,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
      },
    );
    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
      status: result.success ? 'completed' : 'failed',
      toolName,
    };

    await this.recordToolCompleted({
      context: params.context,
      durationMs,
      error: summary.error,
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });

    if (!result.success) {
      const errorMessage = result.error ?? 'Failed to save brand voice.';
      throw new InternalServerErrorException(errorMessage);
    }

    return await this.finalizeStructuredAssistantTurn({
      content: 'Brand voice saved to the selected brand.',
      context: params.context,
      model: params.model,
      result,
      threadId: params.threadId,
      toolCalls: [summary],
    });
  }

  private async executeApprovedPlanAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const snapshot = await runEffectPromise(
      this.getThreadSnapshotEffect(
        params.threadId,
        params.context.organizationId,
      ),
    );
    const latestPlan = snapshot?.latestProposedPlan as
      | Record<string, unknown>
      | undefined;
    const planContent =
      typeof latestPlan?.content === 'string' ? latestPlan.content : '';
    const planId =
      typeof latestPlan?.id === 'string'
        ? latestPlan.id
        : typeof params.payload?.planId === 'string'
          ? params.payload.planId
          : 'plan';

    if (!planContent.trim()) {
      throw new BadRequestException(
        'No proposed plan is available to approve.',
      );
    }

    await this.recordPlanUpserted({
      context: params.context,
      plan: {
        approvedAt: new Date().toISOString(),
        awaitingApproval: false,
        content: planContent,
        explanation:
          typeof latestPlan?.explanation === 'string'
            ? latestPlan.explanation
            : undefined,
        id: planId,
        lastReviewAction: 'approve',
        status: 'approved',
        steps: Array.isArray(latestPlan?.steps)
          ? (latestPlan.steps as Record<string, unknown>[])
          : undefined,
      },
      runId: params.context.runId,
      threadId: params.threadId,
    });

    const request: AgentChatRequest = {
      content: `Execute the approved plan exactly as written below. Do not regenerate a new plan unless the user explicitly asks.\n\nApproved plan:\n${planContent}`,
      model: params.model,
      source: 'agent',
      threadId: params.threadId,
    };

    return await this.executeSynchronousChatLoop({
      context: params.context,
      generationPriority: params.context.generationPriority ?? 'balanced',
      model: params.model,
      policy: {
        allowAdvancedOverrides: false,
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        brandId: undefined,
        creditGovernance: {
          useOrganizationPool: true,
        },
        generationModelOverride: undefined,
        generationPriority: params.context.generationPriority ?? 'balanced',
        platform: undefined,
        qualityTier: 'balanced',
        reviewModelOverride: undefined,
        thinkingModelOverride: undefined,
      } as ResolvedAgentExecutionPolicy,
      request,
      resolvedMemories: [],
      seedTitle: '',
      systemPromptOverride: undefined,
      threadId: params.threadId,
      turnCost: getAgentTurnCost(params.model),
    });
  }

  private async executeRevisedPlanAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const snapshot = await runEffectPromise(
      this.getThreadSnapshotEffect(
        params.threadId,
        params.context.organizationId,
      ),
    );
    const latestPlan = snapshot?.latestProposedPlan as
      | Record<string, unknown>
      | undefined;
    const revisionNote =
      typeof params.payload?.revisionNote === 'string'
        ? params.payload.revisionNote.trim()
        : '';
    const previousPlan =
      typeof latestPlan?.content === 'string' ? latestPlan.content : '';

    const request: AgentChatRequest = {
      content: revisionNote
        ? `Revise the current implementation plan using this feedback: ${revisionNote}`
        : 'Revise the current implementation plan and keep execution paused for review.',
      model: params.model,
      source: 'agent',
      systemPromptOverride: previousPlan
        ? `Current proposed plan:\n${previousPlan}`
        : undefined,
      threadId: params.threadId,
    };

    return await this.generatePlanModeResponse({
      context: params.context,
      model: params.model,
      request,
      resolvedMemories: [],
      reviewMetadata: {
        lastReviewAction: 'request_changes',
        revisionNote: revisionNote || undefined,
      },
      seedTitle: '',
      systemPromptOverride: request.systemPromptOverride,
      threadId: params.threadId,
      turnCost: getAgentTurnCost(params.model),
    });
  }

  private normalizeUiBlocks(blocks: unknown[]): AgentUIBlock[] {
    const normalized: AgentUIBlock[] = [];

    for (const block of blocks) {
      if (!block || typeof block !== 'object') {
        continue;
      }

      normalized.push(block as AgentUIBlock);
    }

    return normalized;
  }

  private normalizeFinalAssistantContent(
    content: string,
    toolCalls: ToolCallSummary[],
    uiActions: AgentUiAction[],
  ): { content: string; isFallback: boolean } {
    const hasBatchGenerationResultCard = uiActions.some(
      (action) => action.type === 'batch_generation_result_card',
    );

    if (content.trim().length > 0) {
      if (hasBatchGenerationResultCard) {
        const normalizedBatchContent = content
          .replace(/^\s*Batch Details:\s*$/gim, '')
          .replace(/^\s*Batch ID:.*$/gim, '')
          .replace(/^\s*Status:.*$/gim, '')
          .replace(/^\s*Credits used:.*$/gim, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        return {
          content:
            normalizedBatchContent.length > 0
              ? normalizedBatchContent
              : 'Your batch is in motion. The latest status is below.',
          isFallback: false,
        };
      }

      return { content, isFallback: false };
    }

    if (toolCalls.length === 0 && uiActions.length === 0) {
      return { content, isFallback: false };
    }

    const hasVoiceCloneSetup = toolCalls.some(
      (toolCall) =>
        toolCall.status === 'completed' &&
        toolCall.toolName === AgentToolName.PREPARE_VOICE_CLONE,
    );

    if (hasVoiceCloneSetup) {
      return {
        content:
          'I opened voice clone setup below. Upload a sample or pick an existing voice.',
        isFallback: true,
      };
    }

    return { content: 'I prepared the next step below.', isFallback: true };
  }

  private buildMemoryEntriesForResponse(memoryEntries: AgentMemoryDocument[]) {
    return memoryEntries.map((memory) => {
      const timedMemory = memory as AgentMemoryDocument & { createdAt?: Date };

      return {
        confidence: memory.confidence,
        content: memory.content,
        contentType: memory.contentType,
        createdAt: timedMemory.createdAt?.toISOString(),
        id: memory._id,
        importance: memory.importance,
        kind: memory.kind,
        platform: memory.platform,
        scope: memory.scope,
        sourceContentId: memory.sourceContentId,
        sourceMessageId: memory.sourceMessageId,
        sourceType: memory.sourceType,
        sourceUrl: memory.sourceUrl,
        summary: memory.summary,
        tags: memory.tags ?? [],
      };
    });
  }

  private buildMemoryPromptSections(memories: AgentMemoryDocument[]): string {
    const sections = new Map<string, string[]>();
    const order = [
      'User Preferences',
      'Saved Instructions',
      'Winning Patterns',
      'Reference Examples',
      'Avoid These Patterns',
    ];

    for (const memory of memories) {
      const section = this.resolveMemorySection(memory);
      const line = this.formatMemoryLine(memory);

      if (!line) {
        continue;
      }

      const bucket = sections.get(section) ?? [];
      bucket.push(line);
      sections.set(section, bucket);
    }

    const rendered = order
      .filter((section) => sections.has(section))
      .map((section) => `## ${section}\n${sections.get(section)?.join('\n')}`)
      .join('\n\n');

    return rendered ? `Saved memory to consider:\n\n${rendered}` : '';
  }

  private resolveMemorySection(memory: AgentMemoryDocument): string {
    switch (memory.kind) {
      case 'negative_example':
        return 'Avoid These Patterns';
      case 'winner':
      case 'pattern':
        return 'Winning Patterns';
      case 'reference':
      case 'positive_example':
        return 'Reference Examples';
      case 'preference':
        return 'User Preferences';
      case 'instruction':
      default:
        return 'Saved Instructions';
    }
  }

  private formatMemoryLine(memory: AgentMemoryDocument): string {
    const base = (memory.summary || memory.content || '')
      .trim()
      .replace(/\s+/g, ' ');

    if (!base) {
      return '';
    }

    const qualifiers: string[] = [];
    if (memory.contentType && memory.contentType !== 'generic') {
      qualifiers.push(memory.contentType);
    }
    if (memory.platform) {
      qualifiers.push(memory.platform);
    }
    if (memory.scope === 'brand') {
      qualifiers.push('brand');
    }

    const prefix = qualifiers.length ? `[${qualifiers.join(' / ')}] ` : '';
    const snippet = base.length > 220 ? `${base.slice(0, 217)}...` : base;
    return `- ${prefix}${snippet}`;
  }

  private inferMemoryContentType(content: string): string {
    const normalized = content.toLowerCase();

    if (
      normalized.includes('newsletter') ||
      normalized.includes('substack') ||
      normalized.includes('beehiiv') ||
      normalized.includes('ghost')
    ) {
      return 'newsletter';
    }

    if (normalized.includes('thread')) {
      return 'thread';
    }

    if (normalized.includes('tweet') || normalized.includes('x post')) {
      return 'tweet';
    }

    if (normalized.includes('article') || normalized.includes('blog')) {
      return 'article';
    }

    if (normalized.includes('post')) {
      return 'post';
    }

    return 'generic';
  }

  /**
   * Inject campaign context (brief + recent peer messages) into the system prompt.
   * Called when a strategy is part of a campaign for coordination.
   */
  private async injectCampaignContext(
    campaignId: string,
    organizationId: string,
    existingPrompt: string | undefined,
  ): Promise<string | undefined> {
    try {
      const campaign = await this.agentCampaignsService?.findOneById(
        campaignId,
        organizationId,
      );

      if (!campaign) {
        return existingPrompt;
      }

      const recentMessages =
        await this.agentMessageBusService?.getRecentMessages(campaignId, 10);

      const campaignSection = [
        '\n\n## Campaign Coordination',
        `You are part of campaign: "${campaign.label}"`,
        campaign.brief ? `Campaign Brief: ${campaign.brief}` : '',
        `Campaign Status: ${campaign.status}`,
        `Credits Used: ${campaign.creditsUsed} / ${campaign.creditsAllocated} allocated`,
        campaign.agents.length > 1
          ? `Other agents in this campaign: ${campaign.agents.length - 1}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      let peerMessagesSection = '';
      if (recentMessages && recentMessages.length > 0) {
        const messageLines = recentMessages.map(
          (msg) =>
            `- [${msg.type}] Agent ${msg.agentId}: ${JSON.stringify(msg.payload)}`,
        );
        peerMessagesSection = `\n\n## Recent Peer Activity\n${messageLines.join('\n')}`;
      }

      const basePrompt = existingPrompt || '';
      return `${basePrompt}${campaignSection}${peerMessagesSection}`;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} failed to inject campaign context`,
        error,
      );
      return existingPrompt;
    }
  }

  private async recordThreadTurnRequested(params: {
    threadId: string;
    context: AgentChatContext;
    model: string;
    content: string;
    runId?: string;
    source?: AgentChatRequest['source'];
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `turn-requested:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
          source: params.source ?? 'agent',
        },
        organizationId: params.context.organizationId,
        payload: {
          content: params.content,
          model: params.model,
          requestedModel: params.model,
          source: params.source ?? 'agent',
          startedAt: new Date().toISOString(),
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'thread.turn_requested',
        userId: params.context.userId,
      }),
    );
  }

  private async recordAssistantFinalized(params: {
    threadId: string;
    context: AgentChatContext;
    content: string;
    metadata: Record<string, unknown>;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `assistant-finalized:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
          origin: 'agent-orchestrator',
        },
        organizationId: params.context.organizationId,
        payload: {
          content: params.content,
          messageId: `${params.threadId}:${params.runId ?? 'sync'}`,
          metadata: params.metadata,
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'assistant.finalized',
        userId: params.context.userId,
      }),
    );
  }

  private async recordPlanUpserted(params: {
    context: AgentChatContext;
    threadId: string;
    plan: {
      id: string;
      content: string;
      explanation?: string;
      steps?: Record<string, unknown>[];
      status: 'awaiting_approval' | 'approved';
      awaitingApproval: boolean;
      lastReviewAction?: 'approve' | 'request_changes';
      revisionNote?: string;
      approvedAt?: string;
    };
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `plan-upserted:${params.threadId}:${params.plan.id}:${params.runId ?? Date.now()}`,
        metadata: {
          origin: 'agent-orchestrator',
        },
        organizationId: params.context.organizationId,
        payload: {
          approvedAt: params.plan.approvedAt,
          awaitingApproval: params.plan.awaitingApproval,
          content: params.plan.content,
          explanation: params.plan.explanation,
          id: params.plan.id,
          lastReviewAction: params.plan.lastReviewAction,
          revisionNote: params.plan.revisionNote,
          status: params.plan.status,
          steps: params.plan.steps,
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'plan.upserted',
        userId: params.context.userId,
      }),
    );
  }

  private async recordProfileSnapshot(
    threadId: string,
    context: AgentChatContext,
    agentType?: AgentType,
  ): Promise<void> {
    if (!this.agentProfileResolverService || !this.agentThreadEngineService) {
      return;
    }

    const profile = this.agentProfileResolverService.resolve({
      agentType,
      campaignId: context.campaignId,
      strategyId: context.strategyId,
    });

    // Merge skill tool overrides into the profile snapshot
    if (context.resolvedSkills?.length && this.skillRuntimeService) {
      const enabledTools = this.skillRuntimeService.mergeSkillToolOverrides(
        profile.enabledTools,
        context.resolvedSkills,
      );

      if (enabledTools) {
        profile.enabledTools = enabledTools;
      }
    }

    await runEffectPromise(
      this.recordThreadProfileSnapshotEffect(
        threadId,
        context.organizationId,
        profile,
      ),
    );
  }

  private async runInThreadLane<T>(
    threadId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    return runEffectPromise(this.runInThreadLaneEffect(threadId, run));
  }

  private async flushThreadMemory(
    threadId: string,
    context: AgentChatContext,
    reason: 'archive' | 'branch',
  ): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    const recentMessages = await this.agentMessagesService.getMessagesByRoom(
      threadId,
      context.organizationId,
      { limit: 12, page: 1 },
    );
    const summary = recentMessages
      .slice()
      .reverse()
      .filter(
        (message) =>
          message.role === AgentMessageRole.USER ||
          message.role === AgentMessageRole.ASSISTANT,
      )
      .map((message) => `${message.role}: ${message.content ?? ''}`.trim())
      .filter((entry) => entry.length > 0)
      .join('\n')
      .slice(0, 4000);

    if (!summary) {
      return;
    }

    await runEffectPromise(
      this.recordThreadMemoryFlushEffect(
        threadId,
        context.organizationId,
        context.userId,
        summary,
        ['agent-thread', reason],
      ),
    );
  }

  private async recordThreadTurnStarted(params: {
    context: AgentChatContext;
    threadId: string;
    model: string;
    runId?: string;
    source?: AgentChatRequest['source'];
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `turn-started:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
          origin: 'agent-orchestrator',
          source: params.source ?? 'agent',
        },
        organizationId: params.context.organizationId,
        payload: {
          detail: 'Agent turn started',
          model: params.model,
          requestedModel: params.model,
          source: params.source ?? 'agent',
          startedAt: new Date().toISOString(),
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'thread.turn_started',
        userId: params.context.userId,
      }),
    );
  }

  private async recordToolStarted(params: {
    context: AgentChatContext;
    threadId: string;
    parameters: Record<string, unknown>;
    runId?: string;
    toolCallId?: string;
    toolName: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `tool-started:${params.threadId}:${params.toolCallId ?? params.toolName}:${params.runId ?? Date.now()}`,
        metadata: {
          origin: 'agent-orchestrator',
        },
        organizationId: params.context.organizationId,
        payload: {
          parameters: params.parameters,
          toolCallId: params.toolCallId,
          toolName: params.toolName,
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'tool.started',
        userId: params.context.userId,
      }),
    );
  }

  private async recordToolCompleted(params: {
    context: AgentChatContext;
    threadId: string;
    durationMs: number;
    error?: string;
    runId?: string;
    status: 'completed' | 'failed';
    toolCallId?: string;
    toolName: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `tool-completed:${params.threadId}:${params.toolCallId ?? params.toolName}:${params.runId ?? Date.now()}`,
        metadata: {
          origin: 'agent-orchestrator',
        },
        organizationId: params.context.organizationId,
        payload: {
          durationMs: params.durationMs,
          error: params.error,
          status: params.status,
          toolCallId: params.toolCallId,
          toolName: params.toolName,
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'tool.completed',
        userId: params.context.userId,
      }),
    );
  }

  private async recordUiBlocksUpdated(params: {
    blockIds?: string[];
    blocks?: AgentUIBlock[];
    context: AgentChatContext;
    threadId: string;
    operation: AgentDashboardOperation;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `ui-blocks:${params.threadId}:${params.runId ?? Date.now()}:${params.operation}`,
        metadata: {
          origin: 'agent-orchestrator',
        },
        organizationId: params.context.organizationId,
        payload: {
          blockIds: params.blockIds,
          blocks: params.blocks,
          operation: params.operation,
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'ui.blocks_updated',
        userId: params.context.userId,
      }),
    );
  }

  private async recordRunCompleted(params: {
    context: AgentChatContext;
    threadId: string;
    detail: string;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `run-completed:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
          origin: 'agent-orchestrator',
        },
        organizationId: params.context.organizationId,
        payload: {
          detail: params.detail,
          label: 'Agent completed',
          status: 'completed',
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'run.completed',
        userId: params.context.userId,
      }),
    );
  }

  private async recordRunFailed(params: {
    context: AgentChatContext;
    threadId: string;
    error: string;
    runId?: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    await runEffectPromise(
      this.appendThreadEventEffect({
        commandId: `run-failed:${params.threadId}:${params.runId ?? Date.now()}`,
        metadata: {
          origin: 'agent-orchestrator',
        },
        organizationId: params.context.organizationId,
        payload: {
          error: params.error,
          label: 'Agent failed',
          status: 'failed',
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'run.failed',
        userId: params.context.userId,
      }),
    );
  }

  private publishStreamLifecycleStartedEffect(params: {
    context: AgentChatContext;
    model: string;
    startedAt?: string;
    threadId: string;
  }): Effect.Effect<void, unknown> {
    return this.publishStreamStartEffect({
      model: params.model,
      runId: params.context.runId,
      startedAt: params.startedAt,
      threadId: params.threadId,
      userId: params.context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          event: 'started',
          label: 'Agent started',
          runId: params.context.runId,
          startedAt: params.startedAt,
          status: 'running',
          threadId: params.threadId,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  private publishStreamStartEffect(
    data: Parameters<AgentStreamPublisherService['publishStreamStart']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishStreamStartEffect(data);
  }

  private publishStreamTokenEffect(
    data: Parameters<AgentStreamPublisherService['publishToken']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishTokenEffect(data);
  }

  private publishStreamReasoningEffect(
    data: Parameters<AgentStreamPublisherService['publishReasoning']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishReasoningEffect(data);
  }

  private publishStreamDoneEffect(
    data: Parameters<AgentStreamPublisherService['publishDone']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishDoneEffect(data);
  }

  private publishStreamToolStartEffect(
    data: Parameters<AgentStreamPublisherService['publishToolStart']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishToolStartEffect(data);
  }

  private publishStreamToolCompleteEffect(
    data: Parameters<AgentStreamPublisherService['publishToolComplete']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishToolCompleteEffect(data);
  }

  private publishStreamErrorEffect(
    data: Parameters<AgentStreamPublisherService['publishError']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishErrorEffect(data);
  }

  private publishStreamWorkEventEffect(
    data: Parameters<AgentStreamPublisherService['publishWorkEvent']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishWorkEventEffect(data);
  }

  private publishStreamUiBlocksEventEffect(
    data: Parameters<AgentStreamPublisherService['publishUIBlocks']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishUIBlocksEffect(data);
  }

  private publishStreamInputRequestEventEffect(
    data: Parameters<AgentStreamPublisherService['publishInputRequest']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishInputRequestEffect(data);
  }

  private publishStreamAssistantResponseEffect(params: {
    content: string;
    context: AgentChatContext;
    reasoning: string | null;
    threadId: string;
  }): Effect.Effect<void, unknown> {
    const publishReasoningEffect = params.reasoning
      ? this.publishStreamReasoningEffect({
          content: params.reasoning!,
          runId: params.context.runId,
          threadId: params.threadId,
          userId: params.context.userId,
        }).pipe(Effect.catchAll(() => Effect.void))
      : Effect.void;

    const words = params.content.split(/(\s+)/).filter(Boolean);

    return publishReasoningEffect.pipe(
      Effect.zipRight(
        Effect.forEach(
          words,
          (word) =>
            this.publishStreamTokenEffect({
              runId: params.context.runId,
              threadId: params.threadId,
              token: word,
              userId: params.context.userId,
            }).pipe(Effect.catchAll(() => Effect.void)),
          { discard: true },
        ),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  private publishStreamCompletionEffect(params: {
    completionMetadata: Record<string, unknown>;
    content: string;
    context: AgentChatContext;
    creditsRemaining: number;
    creditsUsed: number;
    durationMs?: number;
    runStartedAt?: string;
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Effect.Effect<void, unknown> {
    return this.publishStreamDoneEffect({
      creditsRemaining: params.creditsRemaining,
      creditsUsed: params.creditsUsed,
      durationMs: params.durationMs,
      fullContent: params.content,
      metadata: params.completionMetadata,
      runId: params.context.runId,
      startedAt: params.runStartedAt,
      threadId: params.threadId,
      toolCalls: params.toolCalls,
      userId: params.context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: `${params.toolCalls.length} tool call${params.toolCalls.length === 1 ? '' : 's'} completed`,
          event: 'completed',
          label: 'Agent completed',
          runId: params.context.runId,
          status: 'completed',
          threadId: params.threadId,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  private publishStreamDoneOnlyEffect(params: {
    content: string;
    context: AgentChatContext;
    creditsRemaining: number;
    creditsUsed: number;
    metadata: Record<string, unknown>;
    startedAt?: string;
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Effect.Effect<void, unknown> {
    return this.publishStreamDoneEffect({
      creditsRemaining: params.creditsRemaining,
      creditsUsed: params.creditsUsed,
      fullContent: params.content,
      metadata: params.metadata,
      runId: params.context.runId,
      startedAt: params.startedAt,
      threadId: params.threadId,
      toolCalls: params.toolCalls,
      userId: params.context.userId,
    }).pipe(Effect.catchAll(() => Effect.void));
  }

  private publishStreamingToolStartedEffect(params: {
    context: AgentChatContext;
    detail?: string;
    label?: string;
    parameters: Record<string, unknown>;
    progress?: number;
    startedAt: string;
    threadId: string;
    toolCallId: string;
    toolName: string;
    workEventDetail?: string;
    workEventLabel?: string;
  }): Effect.Effect<void, unknown> {
    const detail = params.detail ?? `Starting ${params.toolName}`;
    const label = params.label ?? params.toolName;
    const progress = params.progress ?? 15;

    return this.publishStreamToolStartEffect({
      detail,
      label,
      parameters: params.parameters,
      phase: 'executing',
      progress,
      runId: params.context.runId,
      startedAt: params.startedAt,
      threadId: params.threadId,
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      userId: params.context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: params.workEventDetail ?? `Running ${params.toolName}`,
          event: 'tool_started',
          label: params.workEventLabel ?? label,
          parameters: params.parameters,
          phase: 'executing',
          progress,
          runId: params.context.runId,
          startedAt: params.startedAt,
          status: 'running',
          threadId: params.threadId,
          toolCallId: params.toolCallId,
          toolName: params.toolName,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  private publishStreamUiBlocksEffect(params: {
    blockIds?: string[];
    blocks?: AgentUIBlocksEvent['blocks'];
    context: AgentChatContext;
    operation: AgentDashboardOperation;
    runId?: string;
    threadId: string;
  }): Effect.Effect<void, unknown> {
    return this.publishStreamUiBlocksEventEffect({
      blockIds: params.blockIds,
      blocks: params.blocks,
      operation: params.operation,
      runId: params.runId ?? params.context.runId,
      threadId: params.threadId,
      userId: params.context.userId,
    }).pipe(Effect.catchAll(() => Effect.void));
  }

  private publishStreamInputRequestEffect(params: {
    allowFreeText?: boolean;
    context: AgentChatContext;
    fieldId?: string;
    inputRequestId: string;
    metadata?: Record<string, unknown>;
    options?: Array<{
      description?: string;
      id: string;
      label: string;
    }>;
    prompt: string;
    recommendedOptionId?: string;
    runId?: string;
    threadId: string;
    title: string;
  }): Effect.Effect<void, unknown> {
    return this.publishStreamInputRequestEventEffect({
      allowFreeText: params.allowFreeText,
      fieldId: params.fieldId,
      inputRequestId: params.inputRequestId,
      metadata: params.metadata,
      options: params.options,
      prompt: params.prompt,
      recommendedOptionId: params.recommendedOptionId,
      runId: params.runId ?? params.context.runId,
      threadId: params.threadId,
      title: params.title,
      userId: params.context.userId,
    }).pipe(Effect.catchAll(() => Effect.void));
  }

  private publishStreamingToolCompletedEffect(params: {
    context: AgentChatContext;
    creditsUsed?: number;
    debug?: Record<string, unknown>;
    detail?: string;
    durationMs: number;
    error?: string;
    label?: string;
    parameters?: Record<string, unknown>;
    resultSummary?: string;
    status: 'completed' | 'failed';
    threadId: string;
    toolCallId: string;
    toolName: string;
    uiActions?: AgentUiAction[];
  }): Effect.Effect<void, unknown> {
    const label = params.label ?? params.toolName;
    const phase = params.status === 'completed' ? 'completed' : 'failed';

    return this.publishStreamToolCompleteEffect({
      creditsUsed: params.creditsUsed ?? 0,
      debug: params.debug,
      detail: params.detail,
      durationMs: params.durationMs,
      error: params.error,
      label,
      parameters: params.parameters,
      phase,
      progress: 100,
      resultSummary: params.resultSummary,
      runId: params.context.runId,
      status: params.status,
      threadId: params.threadId,
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      uiActions: params.uiActions,
      userId: params.context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: params.detail,
          event: 'tool_completed',
          label,
          parameters: params.parameters,
          phase,
          progress: 100,
          resultSummary: params.resultSummary,
          runId: params.context.runId,
          status: params.status,
          threadId: params.threadId,
          toolCallId: params.toolCallId,
          toolName: params.toolName,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  private publishStreamFailureEffect(params: {
    context: AgentChatContext;
    error: string;
    failRun: boolean;
    threadId: string;
  }): Effect.Effect<void, unknown> {
    const failRunEffect =
      params.failRun && params.context.runId
        ? fromPromiseEffect(() =>
            this.agentRunsService.fail(
              params.context.runId!,
              params.context.organizationId,
              params.error,
            ),
          ).pipe(Effect.asVoid)
        : Effect.void;

    return failRunEffect.pipe(
      Effect.zipRight(
        this.publishStreamErrorEffect({
          error: params.error,
          runId: params.context.runId,
          threadId: params.threadId,
          userId: params.context.userId,
        }),
      ),
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: params.error,
          event: 'failed',
          label: 'Agent failed',
          runId: params.context.runId,
          status: 'failed',
          threadId: params.threadId,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  private publishStreamCancelledEffect(
    context: AgentChatContext,
    threadId: string,
  ): Effect.Effect<void, unknown> {
    return this.publishStreamErrorEffect({
      error: 'Agent run cancelled',
      runId: context.runId,
      threadId,
      userId: context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: 'The active run was stopped by the user.',
          event: 'cancelled',
          label: 'Agent cancelled',
          runId: context.runId,
          status: 'cancelled',
          threadId,
          userId: context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  private publishStreamErrorOnlyEffect(
    context: AgentChatContext,
    threadId: string,
    error: string,
  ): Effect.Effect<void, unknown> {
    return this.publishStreamErrorEffect({
      error,
      runId: context.runId,
      threadId,
      userId: context.userId,
    }).pipe(Effect.catchAll(() => Effect.void));
  }

  private getRuntimeBindingEffect(
    threadId: string,
    organizationId: string,
  ): Effect.Effect<
    Awaited<ReturnType<AgentRuntimeSessionService['getBinding']>> | null,
    unknown
  > {
    if (!this.agentRuntimeSessionService) {
      return Effect.succeed(null);
    }

    return this.agentRuntimeSessionService.getBindingEffect(
      threadId,
      organizationId,
    );
  }

  private upsertRuntimeBindingEffect(params: {
    threadId: string;
    organizationId: string;
    runId?: string;
    model?: string;
    status: 'running' | 'waiting_input' | 'completed' | 'cancelled' | 'failed';
    resumeCursor?: Record<string, unknown>;
  }): Effect.Effect<void, unknown> {
    if (!this.agentRuntimeSessionService) {
      return Effect.void;
    }

    return this.agentRuntimeSessionService
      .upsertBindingEffect(params)
      .pipe(Effect.asVoid);
  }

  private getThreadSnapshotEffect(
    threadId: string,
    organizationId: string,
  ): Effect.Effect<
    Awaited<ReturnType<AgentThreadEngineService['getSnapshot']>> | null,
    unknown
  > {
    if (!this.agentThreadEngineService) {
      return Effect.succeed(null);
    }

    return this.agentThreadEngineService.getSnapshotEffect(
      threadId,
      organizationId,
    );
  }

  private appendThreadEventEffect(
    params: AppendAgentThreadEventParams,
  ): Effect.Effect<void, unknown> {
    if (!this.agentThreadEngineService) {
      return Effect.void;
    }

    return this.agentThreadEngineService
      .appendEventEffect(params)
      .pipe(Effect.asVoid);
  }

  private recordThreadProfileSnapshotEffect(
    threadId: string,
    organizationId: string,
    profile: object,
  ): Effect.Effect<void, unknown> {
    if (!this.agentThreadEngineService) {
      return Effect.void;
    }

    return this.agentThreadEngineService
      .recordProfileSnapshotEffect(threadId, organizationId, profile)
      .pipe(Effect.asVoid);
  }

  private recordThreadMemoryFlushEffect(
    threadId: string,
    organizationId: string,
    userId: string,
    content: string,
    tags: string[],
  ): Effect.Effect<string | null, unknown> {
    if (!this.agentThreadEngineService) {
      return Effect.succeed(null);
    }

    return this.agentThreadEngineService.recordMemoryFlushEffect(
      threadId,
      organizationId,
      userId,
      content,
      tags,
    );
  }

  private runInThreadLaneEffect<T>(
    threadId: string,
    run: () => Promise<T> | T,
  ): Effect.Effect<T, unknown> {
    if (!this.agentExecutionLaneService) {
      return fromPromiseEffect(run);
    }

    return this.agentExecutionLaneService.runExclusiveEffect(threadId, () =>
      fromPromiseEffect(run),
    );
  }

  private async finalizeStructuredAssistantTurn(params: {
    content: string;
    context: AgentChatContext;
    model: string;
    result: {
      creditsUsed?: number;
      data?: Record<string, unknown>;
      nextActions?: AgentUiAction[];
      requiresConfirmation?: boolean;
      riskLevel?: 'low' | 'medium' | 'high';
    };
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Promise<AgentChatResult> {
    let latestUiBlocks: {
      operation: AgentDashboardOperation;
      blocks?: unknown[];
      blockIds?: string[];
    } | null = null;

    const rawUiBlocks = Array.isArray(params.result.data?.uiBlocks)
      ? params.result.data.uiBlocks
      : null;
    const rawOperation =
      typeof params.result.data?.operation === 'string'
        ? (params.result.data.operation as AgentDashboardOperation)
        : null;

    if (rawUiBlocks && rawOperation) {
      const normalizedBlocks = this.normalizeUiBlocks(rawUiBlocks);

      latestUiBlocks = {
        blockIds: Array.isArray(params.result.data?.blockIds)
          ? (params.result.data.blockIds as string[])
          : undefined,
        blocks: normalizedBlocks,
        operation: rawOperation,
      };

      await this.recordUiBlocksUpdated({
        blockIds: latestUiBlocks.blockIds,
        blocks: normalizedBlocks,
        context: params.context,
        operation: rawOperation,
        runId: params.context.runId,
        threadId: params.threadId,
      });
    }

    const uiActions = params.result.nextActions ?? [];
    const enhancedUiActions = this.buildAssistantUiActions({
      reviewRequired: params.result.requiresConfirmation ?? false,
      toolCalls: params.toolCalls,
      uiActions,
    });
    const normalizedContent = this.normalizeFinalAssistantContent(
      sanitizeAgentOutputText(params.content),
      params.toolCalls,
      enhancedUiActions.uiActions,
    );
    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      isFallbackContent: normalizedContent.isFallback,
      ...this.buildResolvedModelMetadata(params.model),
      reviewRequired: params.result.requiresConfirmation ?? false,
      riskLevel: params.result.riskLevel ?? 'low',
      ...(enhancedUiActions.suggestedActions.length
        ? { suggestedActions: enhancedUiActions.suggestedActions }
        : {}),
      totalCreditsUsed: params.result.creditsUsed ?? 0,
      uiActions: enhancedUiActions.uiActions,
      ...(latestUiBlocks ? { uiBlocks: latestUiBlocks } : {}),
    };

    await this.agentMessagesService.addMessage({
      content: normalizedContent.content,
      metadata: {
        creditsRemaining,
        ...assistantMetadata,
      },
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      toolCalls: params.toolCalls.map((toolCall) => ({
        creditsUsed: toolCall.creditsUsed,
        durationMs: toolCall.durationMs,
        error: toolCall.error,
        parameters: toolCall.parameters ?? {},
        result: toolCall.resultSummary
          ? { summary: toolCall.resultSummary }
          : {},
        status: toolCall.status,
        toolName: toolCall.toolName,
      })),
      userId: params.context.userId,
    });

    await this.recordAssistantFinalized({
      content: normalizedContent.content,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await this.recordRunCompleted({
      context: params.context,
      detail: 'Agent completed',
      runId: params.context.runId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: params.result.creditsUsed ?? 0,
      message: {
        content: normalizedContent.content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: params.toolCalls,
    };
  }

  private buildAgentChatCompletionParams(params: {
    messages: OpenRouterMessage[];
    model: string;
    prompt: string;
    seedTitle?: string;
    source?: AgentChatRequest['source'];
    tools: OpenRouterTool[];
  }): {
    max_tokens: number;
    messages: OpenRouterMessage[];
    model: string;
    plugins?: OpenRouterPlugin[];
    temperature: number;
    tool_choice: 'auto';
    tools: OpenRouterTool[];
  } {
    const routingPolicy = this.resolveRoutingPolicy({
      model: params.model,
      prompt: params.prompt,
      source: params.source,
    });
    const plugins = this.resolveRoutingPlugins(routingPolicy);
    const titleInstruction = params.seedTitle?.trim()
      ? [
          {
            content:
              'If you are ready to provide the final assistant reply for this new conversation and you are not making a tool call, respond with valid JSON only: {"title":"3 to 5 word title in title case","content":"full assistant reply"}. If you need to make a tool call, do that normally and ignore this formatting instruction until the final reply.',
            role: 'system' as const,
          },
        ]
      : [];

    return {
      max_tokens: 4096,
      messages: [...titleInstruction, ...params.messages],
      model: params.model,
      ...(plugins ? { plugins } : {}),
      temperature: 0.7,
      tool_choice: 'auto',
      tools: params.tools,
    };
  }

  private buildPlanningChatCompletionParams(params: {
    messages: OpenRouterMessage[];
    model: string;
    prompt: string;
    seedTitle?: string;
    source?: AgentChatRequest['source'];
  }): {
    max_tokens: number;
    messages: OpenRouterMessage[];
    model: string;
    plugins?: OpenRouterPlugin[];
    temperature: number;
  } {
    const routingPolicy = this.resolveRoutingPolicy({
      model: params.model,
      prompt: params.prompt,
      source: params.source,
    });
    const plugins = this.resolveRoutingPlugins(routingPolicy);
    const planInstruction = {
      content:
        'Plan mode is enabled. Do not call tools or execute work. Respond with valid JSON only: {"title":"optional thread title","summary":"one short summary sentence","explanation":"brief rationale","content":"markdown plan","steps":[{"step":"...", "status":"pending"}]}. Keep the plan concise and execution-ready.',
      role: 'system' as const,
    };

    return {
      max_tokens: 2048,
      messages: [planInstruction, ...params.messages],
      model: params.model,
      ...(plugins ? { plugins } : {}),
      temperature: 0.3,
    };
  }

  private extractPlanEnvelope(params: {
    assistantContent: string;
    prompt: string;
    seedTitle: string;
  }): {
    title: string | null;
    summary: string;
    plan: {
      id: string;
      content: string;
      explanation?: string;
      steps?: Record<string, unknown>[];
      status: 'awaiting_approval';
      awaitingApproval: true;
    };
  } {
    const trimmed = params.assistantContent.trim();
    const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmed;
    let parsed: Record<string, unknown> | null = null;

    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      try {
        parsed = JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    const content =
      typeof parsed?.content === 'string' && parsed.content.trim()
        ? parsed.content.trim()
        : candidate;
    const explanation =
      typeof parsed?.explanation === 'string' && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : undefined;
    const summary =
      typeof parsed?.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : 'I drafted a plan and paused for your approval.';
    const title =
      typeof parsed?.title === 'string' && parsed.title.trim()
        ? this.sanitizeGeneratedThreadTitle(parsed.title.trim(), params.prompt)
        : params.seedTitle.trim()
          ? this.buildFallbackThreadTitle(params.prompt)
          : null;
    const steps = Array.isArray(parsed?.steps)
      ? (parsed?.steps as Record<string, unknown>[])
      : undefined;

    return {
      plan: {
        awaitingApproval: true,
        content,
        ...(explanation ? { explanation } : {}),
        id: `plan-${Date.now()}`,
        status: 'awaiting_approval',
        ...(steps ? { steps } : {}),
      },
      summary,
      title,
    };
  }

  private resolveRoutingPolicy(params: {
    model: string;
    prompt: string;
    source?: AgentChatRequest['source'];
  }): AgentRoutingPolicy {
    if (params.model !== DEFAULT_AGENT_CHAT_MODEL) {
      return { reason: 'default' };
    }

    if (params.source === 'onboarding') {
      return { reason: 'default' };
    }

    if (this.isExplicitWebSearchPrompt(params.prompt)) {
      return {
        plugins: [{ id: 'web' }],
        reason: 'explicit-web-search',
      };
    }

    if (this.isFreshLiveDataPrompt(params.prompt)) {
      return {
        plugins: [{ id: 'web' }],
        reason: 'fresh-live-data',
      };
    }

    return { reason: 'default' };
  }

  private resolveRoutingPlugins(
    policy: AgentRoutingPolicy,
  ): OpenRouterPlugin[] | undefined {
    if (policy.reason === 'default') {
      return undefined;
    }

    return policy.plugins;
  }

  private isExplicitWebSearchPrompt(prompt: string): boolean {
    return EXPLICIT_WEB_SEARCH_PATTERN.test(prompt);
  }

  private isFreshLiveDataPrompt(prompt: string): boolean {
    const normalizedPrompt = prompt.toLowerCase();
    const hasFreshnessCue = LIVE_DATA_KEYWORDS.some((keyword) =>
      normalizedPrompt.includes(keyword),
    );

    if (!hasFreshnessCue) {
      return false;
    }

    return LIVE_DATA_TOPIC_KEYWORDS.some((keyword) =>
      normalizedPrompt.includes(keyword),
    );
  }

  private buildRoutingMetadata(params: {
    model: string;
    prompt: string;
    source?: AgentChatRequest['source'];
  }): Partial<{
    routingPolicy: AgentRoutingPolicyReason;
    webSearchEnabled: boolean;
  }> {
    const policy = this.resolveRoutingPolicy(params);

    if (policy.reason === 'default') {
      return {};
    }

    return {
      routingPolicy: policy.reason,
      webSearchEnabled: true,
    };
  }

  private buildResolvedModelMetadata(
    requestedModel: string,
    actualModels?: string[],
  ): {
    actualModel: string;
    actualModels: string[];
    model: string;
    requestedModel: string;
  } {
    const normalizedActualModels = Array.from(
      new Set((actualModels ?? []).filter((model) => model.trim().length > 0)),
    );
    const fallbackModel = requestedModel.trim() || requestedModel;
    const actualModel = normalizedActualModels.at(-1) ?? fallbackModel;

    return {
      actualModel,
      actualModels: normalizedActualModels.length
        ? normalizedActualModels
        : [actualModel],
      model: actualModel,
      requestedModel,
    };
  }

  private buildCompletionSecondaryCtas(
    suggestedActions: AgentCompletionSuggestedAction[],
  ): Array<{
    action: string;
    label: string;
    payload: Record<string, unknown>;
  }> {
    return suggestedActions.slice(0, 3).map((suggestion) => ({
      action: 'send_prompt',
      label: suggestion.label,
      payload: { prompt: suggestion.prompt },
    }));
  }

  private buildCompletionPrimaryCta(
    label: string,
    cta?: AgentUiActionCta,
  ):
    | {
        action?: string;
        href?: string;
        label: string;
        payload?: Record<string, unknown>;
      }
    | undefined {
    if (!cta) {
      return undefined;
    }

    return {
      ...cta,
      label,
    };
  }

  private buildContentCompletionOutputVariants(
    uiActions: AgentUiAction[],
  ): Array<{
    id: string;
    kind: 'audio' | 'image' | 'text' | 'video';
    textContent?: string;
    thumbnailUrl?: string;
    title?: string;
    url?: string;
  }> {
    const variants: Array<{
      id: string;
      kind: 'audio' | 'image' | 'text' | 'video';
      textContent?: string;
      thumbnailUrl?: string;
      title?: string;
      url?: string;
    }> = [];

    uiActions.forEach((action) => {
      action.images?.forEach((url, index) => {
        if (!url) {
          return;
        }

        variants.push({
          id: `${action.id}:image:${index}`,
          kind: 'image',
          title: action.title,
          url,
        });
      });

      action.videos?.forEach((url, index) => {
        if (!url) {
          return;
        }

        variants.push({
          id: `${action.id}:video:${index}`,
          kind: 'video',
          title: action.title,
          url,
        });
      });

      action.audio?.forEach((url, index) => {
        if (!url) {
          return;
        }

        variants.push({
          id: `${action.id}:audio:${index}`,
          kind: 'audio',
          title: action.title,
          url,
        });
      });

      action.tweets?.forEach((tweet, index) => {
        if (!tweet.trim()) {
          return;
        }

        variants.push({
          id: `${action.id}:tweet:${index}`,
          kind: 'text',
          textContent: tweet,
          title: `Text ${index + 1}`,
        });
      });

      if (action.textContent?.trim()) {
        variants.push({
          id: `${action.id}:text-content`,
          kind: 'text',
          textContent: action.textContent,
          title: action.title,
        });
      }

      action.ingredients?.forEach((ingredient, index) => {
        if (!ingredient.url) {
          return;
        }

        variants.push({
          id: `${action.id}:ingredient:${index}`,
          kind: ingredient.type === 'video' ? 'video' : 'image',
          thumbnailUrl: ingredient.thumbnailUrl,
          title: ingredient.title ?? action.title,
          url: ingredient.url,
        });
      });
    });

    return variants.slice(0, 4);
  }

  private buildCompletionSummaryCard(params: {
    suggestedActions: AgentCompletionSuggestedAction[];
    toolCalls: Array<Pick<ToolCallSummary, 'status' | 'toolName'>>;
    uiActions: AgentUiAction[];
  }): AgentUiAction | null {
    const workflowAction = params.uiActions.find(
      (action) => action.type === 'workflow_created_card',
    );

    if (workflowAction) {
      return {
        id: `completion-summary-${workflowAction.id}`,
        outcomeBullets: [
          'Automation ready to edit and run',
          workflowAction.workflowName
            ? `Workflow: ${workflowAction.workflowName}`
            : null,
          workflowAction.scheduleSummary ?? null,
        ].filter((bullet): bullet is string => Boolean(bullet)),
        primaryCta: this.buildCompletionPrimaryCta(
          'Use in Workflow',
          workflowAction.ctas?.[0],
        ) ?? {
          href: workflowAction.workflowId
            ? `/automations/editor/${workflowAction.workflowId}`
            : '/automations/editor/',
          label: 'Use in Workflow',
        },
        secondaryCtas: this.buildCompletionSecondaryCtas(
          params.suggestedActions,
        ),
        status: 'completed',
        summaryText: 'Created a recurring automation for this request.',
        title: 'Done',
        type: 'completion_summary_card',
      } as AgentUiAction;
    }

    const contentActions = params.uiActions.filter(
      (action) =>
        action.type === 'content_preview_card' ||
        action.type === 'batch_generation_card' ||
        action.type === 'batch_generation_result_card' ||
        action.type === 'clip_run_card' ||
        action.type === 'clip_workflow_run_card',
    );

    if (contentActions.length > 0) {
      const textCount = contentActions.reduce(
        (total, action) =>
          total +
          (action.tweets?.length ?? 0) +
          (action.textContent?.trim().length ? 1 : 0),
        0,
      );
      const imageCount = contentActions.reduce(
        (total, action) =>
          total +
          (action.images?.length ?? 0) +
          (action.ingredients?.filter(
            (ingredient) => ingredient.type === 'image',
          ).length ?? 0),
        0,
      );
      const videoCount = contentActions.reduce(
        (total, action) =>
          total +
          (action.videos?.length ?? 0) +
          (action.ingredients?.filter(
            (ingredient) => ingredient.type === 'video',
          ).length ?? 0),
        0,
      );
      const audioCount = contentActions.reduce(
        (total, action) => total + (action.audio?.length ?? 0),
        0,
      );
      const outcomeBullets = [
        textCount > 0
          ? `${textCount} text variant${textCount === 1 ? '' : 's'}`
          : null,
        imageCount > 0
          ? `${imageCount} image asset${imageCount === 1 ? '' : 's'}`
          : null,
        videoCount > 0
          ? `${videoCount} video asset${videoCount === 1 ? '' : 's'}`
          : null,
        audioCount > 0
          ? `${audioCount} audio asset${audioCount === 1 ? '' : 's'}`
          : null,
      ].filter((bullet): bullet is string => Boolean(bullet));

      return {
        id: `completion-summary-${contentActions[0].id}`,
        outcomeBullets:
          outcomeBullets.length > 0 ? outcomeBullets : ['Ready for review'],
        outputVariants:
          this.buildContentCompletionOutputVariants(contentActions),
        primaryCta: this.buildCompletionPrimaryCta(
          'Review Draft',
          contentActions.flatMap((action) => action.ctas ?? [])[0],
        ),
        secondaryCtas: this.buildCompletionSecondaryCtas(
          params.suggestedActions,
        ),
        status: 'completed',
        summaryText: 'Generated content for this request.',
        title: 'Done',
        type: 'completion_summary_card',
      } as AgentUiAction;
    }

    const hasCompletedTool = params.toolCalls.some(
      (toolCall) => toolCall.status === 'completed',
    );

    if (!hasCompletedTool) {
      return null;
    }

    if (params.uiActions.length > 0) {
      return null;
    }

    const completedToolNames = params.toolCalls
      .filter((toolCall) => toolCall.status === 'completed')
      .map((toolCall) => toolCall.toolName)
      .filter((toolName): toolName is string => typeof toolName === 'string');

    const outcomeBullets = [
      `${completedToolNames.length} tool action${completedToolNames.length === 1 ? '' : 's'} completed`,
      ...completedToolNames
        .slice(0, 3)
        .map((toolName) => `Tool: ${this.formatCompletionToolName(toolName)}`),
    ];

    return {
      id: `completion-summary-tools-${completedToolNames[0] ?? 'generic'}`,
      outcomeBullets,
      secondaryCtas: this.buildCompletionSecondaryCtas(params.suggestedActions),
      status: 'completed',
      summaryText: 'Completed this request successfully.',
      title: 'Done',
      type: 'completion_summary_card',
    } as AgentUiAction;
  }

  private formatCompletionToolName(toolName: string): string {
    return toolName
      .split('_')
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  private buildAssistantUiActions(params: {
    reviewRequired: boolean;
    toolCalls: Array<Pick<ToolCallSummary, 'status' | 'toolName'>>;
    uiActions: AgentUiAction[];
  }): {
    suggestedActions: AgentCompletionSuggestedAction[];
    uiActions: AgentUiAction[];
  } {
    const suggestedActions = this.buildCompletionSuggestedActions(params);
    const completionSummaryCard = this.buildCompletionSummaryCard({
      suggestedActions,
      toolCalls: params.toolCalls,
      uiActions: params.uiActions,
    });

    return {
      suggestedActions,
      uiActions: completionSummaryCard
        ? [completionSummaryCard, ...params.uiActions]
        : params.uiActions,
    };
  }

  private buildCompletionSuggestedActions(params: {
    reviewRequired: boolean;
    toolCalls: Array<Pick<ToolCallSummary, 'status' | 'toolName'>>;
    uiActions: AgentUiAction[];
  }): AgentCompletionSuggestedAction[] {
    if (params.reviewRequired) {
      return [];
    }

    const completedToolNames = params.toolCalls
      .filter((toolCall) => toolCall.status === 'completed')
      .map((toolCall) => toolCall.toolName);

    if (completedToolNames.length === 0 && params.uiActions.length === 0) {
      return [];
    }

    const uiActionTypes = new Set(
      params.uiActions.map((action) => action.type),
    );
    const suggestions: AgentCompletionSuggestedAction[] = [];
    const seenPrompts = new Set<string>();

    const addSuggestion = (id: string, label: string, prompt: string): void => {
      if (seenPrompts.has(prompt) || suggestions.length >= 3) {
        return;
      }

      seenPrompts.add(prompt);
      suggestions.push({ id, label, prompt });
    };

    const hasCompletedTool = (...toolNames: string[]): boolean =>
      completedToolNames.some((toolName) => toolNames.includes(toolName));

    if (
      uiActionTypes.has('workflow_created_card') ||
      hasCompletedTool(
        AgentToolName.CREATE_WORKFLOW,
        'install_official_workflow',
      )
    ) {
      addSuggestion(
        'workflow-tune',
        'Tune this workflow',
        'Show me how to customize this automation for my brand and goals',
      );
      addSuggestion(
        'workflow-channel',
        'Add another channel',
        'Create a second automation for another channel using this workflow as the base',
      );
      addSuggestion(
        'workflow-schedule',
        'Review schedule',
        'Review the schedule for this automation and suggest the best posting windows',
      );
    }

    if (
      uiActionTypes.has('content_preview_card') ||
      uiActionTypes.has('batch_generation_card') ||
      uiActionTypes.has('batch_generation_result_card') ||
      uiActionTypes.has('clip_run_card') ||
      uiActionTypes.has('clip_workflow_run_card') ||
      hasCompletedTool(
        AgentToolName.GENERATE_CONTENT,
        AgentToolName.GENERATE_CONTENT_BATCH,
        AgentToolName.GENERATE_IMAGE,
        AgentToolName.GENERATE_VIDEO,
        AgentToolName.GENERATE_AS_IDENTITY,
        AgentToolName.GENERATE_VOICE,
      )
    ) {
      addSuggestion(
        'content-variations',
        'Make variations',
        'Make three stronger variations of this result',
      );
      addSuggestion(
        'content-publish',
        'Turn this into a post',
        'Turn this result into a publish-ready post with caption and CTA',
      );
      addSuggestion(
        'content-analyze',
        'Pressure-test it',
        'Rate this result and tell me what to improve before I publish it',
      );
    }

    if (
      uiActionTypes.has('analytics_snapshot_card') ||
      hasCompletedTool(
        AgentToolName.GET_ANALYTICS,
        AgentToolName.ANALYZE_PERFORMANCE,
        'get_top_ingredients',
        'rate_content',
      )
    ) {
      addSuggestion(
        'analytics-repeat',
        'Find repeatable winners',
        'Show me the strongest patterns here and what I should repeat next',
      );
      addSuggestion(
        'analytics-remix',
        'Create a remix',
        'Take the best performer and give me a fresh remix to test next',
      );
      addSuggestion(
        'analytics-schedule',
        'Plan the next batch',
        'Plan my next batch around the winners from this analysis',
      );
    }

    if (
      uiActionTypes.has('publish_post_card') ||
      uiActionTypes.has('schedule_post_card') ||
      uiActionTypes.has('content_calendar_card') ||
      hasCompletedTool(AgentToolName.CREATE_POST, AgentToolName.SCHEDULE_POST)
    ) {
      addSuggestion(
        'publish-followup',
        'Create follow-ups',
        'Create two follow-up posts that build on this result',
      );
      addSuggestion(
        'publish-calendar',
        'Map the next slot',
        'Find the best next slot in my calendar for related content',
      );
      addSuggestion(
        'publish-variants',
        'Cross-post versions',
        'Adapt this into versions for my other active channels',
      );
    }

    if (
      uiActionTypes.has('review_gate_card') ||
      hasCompletedTool(
        AgentToolName.LIST_REVIEW_QUEUE,
        AgentToolName.BATCH_APPROVE_REJECT,
        AgentToolName.GET_APPROVAL_SUMMARY,
      )
    ) {
      addSuggestion(
        'review-ready',
        'Approve the ready ones',
        'Show me the items that are safe to approve right now',
      );
      addSuggestion(
        'review-fix',
        'Fix the weak spots',
        'Take the weakest review items and rewrite them so they are ready to publish',
      );
      addSuggestion(
        'review-schedule',
        'Queue approved content',
        'Schedule the approved content into the best available slots',
      );
    }

    if (
      uiActionTypes.has('trending_topics_card') ||
      hasCompletedTool(
        AgentToolName.GET_TRENDS,
        'list_ads_research',
        'get_ad_research_detail',
      )
    ) {
      addSuggestion(
        'trends-batch',
        'Turn this into content',
        'Turn these trends into a batch of content ideas I can ship this week',
      );
      addSuggestion(
        'trends-angle',
        'Pick the best angle',
        'Tell me which trend has the best upside for my brand and why',
      );
      addSuggestion(
        'trends-automation',
        'Automate this loop',
        'Create an automation that checks this trend pattern and drafts follow-up content',
      );
    }

    return suggestions;
  }

  private normalizeResponseModel(
    requestedModel: string,
    responseModel?: string,
  ): string {
    const trimmedRequestedModel = requestedModel.trim();
    const trimmedResponseModel = responseModel?.trim();

    if (!trimmedResponseModel) {
      return trimmedRequestedModel;
    }

    if (
      !trimmedResponseModel.includes('/') &&
      !trimmedRequestedModel.startsWith('openrouter/')
    ) {
      const provider = trimmedRequestedModel.split('/')[0];
      return `${provider}/${trimmedResponseModel}`;
    }

    return trimmedResponseModel;
  }

  private async recordAgentResponseModel(params: {
    actualModels?: string[];
    context: AgentChatContext;
    requestedModel: string;
    responseModel?: string;
    runId?: string;
    source?: AgentChatRequest['source'];
    threadId: string;
  }): Promise<string> {
    const actualModel = this.normalizeResponseModel(
      params.requestedModel,
      params.responseModel,
    );

    this.loggerService.log(`${this.constructorName} resolved agent response`, {
      actualModel,
      organizationId: params.context.organizationId,
      requestedModel: params.requestedModel,
      runId: params.runId,
      source: params.source ?? 'agent',
      threadId: params.threadId,
      userId: params.context.userId,
    });

    if (params.runId) {
      await this.agentRunsService.mergeMetadata(
        params.runId,
        params.context.organizationId,
        this.buildResolvedModelMetadata(params.requestedModel, [
          ...(params.actualModels ?? []),
          actualModel,
        ]),
      );
    }

    return actualModel;
  }
}
