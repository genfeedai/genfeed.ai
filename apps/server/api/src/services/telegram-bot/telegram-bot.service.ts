/**
 * Telegram Bot Service
 *
 * Workflow execution bot using grammy. Allows users to browse and execute
 * GenFeed workflows via Telegram with conversational input collection.
 * Wired to the real WorkflowEngine for actual execution via Replicate.
 *
 * Separate from the existing TelegramService (social auth integration).
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { RunsService } from '@api/collections/runs/services/runs.service';
import { ConfigService } from '@api/config/config.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import {
  TELEGRAM_BOT_CONSTANTS,
  TELEGRAM_BOT_ENV,
} from '@api/services/telegram-bot/telegram-bot.constants';
import type {
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionProgressEvent,
  ExecutionRunResult,
} from '@genfeedai/workflow-engine';
import {
  createWorkflowEngine,
  type ExecutionContext,
  WorkflowEngine,
} from '@genfeedai/workflow-engine';
import {
  ApiKeyScope,
  ParseMode,
  RunActionType,
  RunAuthType,
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Bot, Context, InlineKeyboard } from 'grammy';

// Workflow JSON type (matches core workflow format)
interface WorkflowJson {
  version: number;
  name: string;
  description: string;
  nodes: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    position?: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }>;
}

// Input requirement derived from workflow nodes
interface WorkflowInput {
  nodeId: string;
  nodeType: string;
  label: string;
  inputType: 'image' | 'text' | 'audio' | 'video';
  required: boolean;
  defaultValue?: string;
}

// Conversation state per chat
type ConversationStep =
  | 'idle'
  | 'selecting_workflow'
  | 'collecting_inputs'
  | 'confirming'
  | 'executing';

interface ConversationState {
  step: ConversationStep;
  workflowId?: string;
  workflowName?: string;
  workflow?: WorkflowJson;
  requiredInputs: WorkflowInput[];
  currentInputIndex: number;
  collectedInputs: Map<string, string>;
  startedAt: number;
  statusMessageId?: number;
}

interface ChatAuthContext {
  authType: RunAuthType;
  organizationId: string;
  userId: string;
  apiKeyId?: string;
  scopes?: string[];
}

type TelegramWorkflowName =
  | 'full-pipeline'
  | 'image-series'
  | 'image-to-video'
  | 'single-image'
  | 'single-video'
  | 'ugc-factory';

interface ReplicatePredictionResult {
  status?: string;
  output?: unknown;
  error?: string;
}

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private bot: Bot | null = null;
  private conversations: Map<number, ConversationState> = new Map();
  private workflows: Map<string, WorkflowJson> = new Map();
  private pendingGenerationImages: Map<number, string> = new Map();
  private recentPhotoTimestamps: Map<number, number> = new Map();
  private allowedUserIds: Set<number> = new Set();
  private chatAuthContexts: Map<number, ChatAuthContext> = new Map();
  private defaultAuthContext: ChatAuthContext | null = null;
  private isRunning = false;
  private engine: WorkflowEngine | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly replicateService: ReplicateService,
    @Optional() private readonly falService?: FalService,
    @Optional() private readonly runsService?: RunsService,
    @Optional() private readonly apiKeysService?: ApiKeysService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get(TELEGRAM_BOT_ENV.TOKEN);
    if (!token) {
      this.loggerService.warn(
        'TelegramBotService: TELEGRAM_BOT_TOKEN not set, bot disabled',
      );
      return;
    }

    const mode = String(
      this.configService.get(TELEGRAM_BOT_ENV.MODE) || 'polling',
    );
    if (mode === 'polling' && !this.configService.isDevTelegramPollingEnabled) {
      this.loggerService.log(
        'TelegramBotService: polling disabled for local development',
      );
      return;
    }

    // Parse allowed user IDs
    const allowedIds = this.configService.get(
      TELEGRAM_BOT_ENV.ALLOWED_USER_IDS,
    );
    if (allowedIds) {
      for (const id of String(allowedIds).split(',')) {
        const parsed = parseInt(id.trim(), 10);
        if (!Number.isNaN(parsed)) {
          this.allowedUserIds.add(parsed);
        }
      }
    }

    const defaultOrganizationId = this.configService.get(
      TELEGRAM_BOT_ENV.DEFAULT_ORGANIZATION_ID,
    );
    const defaultUserId = this.configService.get(
      TELEGRAM_BOT_ENV.DEFAULT_USER_ID,
    );
    if (defaultOrganizationId && defaultUserId) {
      this.defaultAuthContext = {
        authType: RunAuthType.CLERK,
        organizationId: String(defaultOrganizationId),
        userId: String(defaultUserId),
      };
      this.loggerService.log(
        'TelegramBotService: default org/user context enabled for run commands',
      );
    }

    // Load workflows
    await this.loadWorkflows();

    // Initialize workflow engine with executors
    this.initializeEngine();

    // Create bot
    this.bot = new Bot(String(token));
    this.setupHandlers();

    // Start based on mode
    if (mode === 'polling') {
      this.startPolling();
    }
    // Webhook mode is handled by the controller
  }

  onModuleDestroy() {
    this.stopBot();
  }

  /**
   * Initialize the WorkflowEngine with executors for each node type
   */
  private initializeEngine() {
    this.engine = createWorkflowEngine({
      maxConcurrency: 1,
      retryConfig: {
        backoffMultiplier: 2,
        baseDelayMs: 2000,
        maxDelayMs: 30000,
        maxRetries: 2,
      },
    });

    // imageInput: passthrough - just forwards the collected image URL/path
    this.engine.registerExecutor(
      'imageInput',
      async (
        node: ExecutableNode,
        _inputs: Map<string, unknown>,
        _ctx: ExecutionContext,
      ) => {
        // The image URL is stored in node.config.image (set from collected inputs)
        const imageUrl = node.config.image as string;
        if (!imageUrl) {
          throw new Error(`No image provided for node ${node.id}`);
        }
        return { image: imageUrl };
      },
    );

    // telegramInput: same as imageInput
    this.engine.registerExecutor(
      'telegramInput',
      async (
        node: ExecutableNode,
        _inputs: Map<string, unknown>,
        _ctx: ExecutionContext,
      ) => {
        const imageUrl = node.config.image as string;
        if (!imageUrl) {
          throw new Error(`No image provided for node ${node.id}`);
        }
        return { image: imageUrl };
      },
    );

    // prompt: passthrough - just forwards the prompt text
    this.engine.registerExecutor(
      'prompt',
      async (
        node: ExecutableNode,
        _inputs: Map<string, unknown>,
        _ctx: ExecutionContext,
      ) => {
        const prompt = node.config.prompt as string;
        if (!prompt) {
          throw new Error(`No prompt provided for node ${node.id}`);
        }
        return { text: prompt };
      },
    );

    // imageGen: calls Replicate to generate an image
    this.engine.registerExecutor(
      'imageGen',
      async (
        node: ExecutableNode,
        inputs: Map<string, unknown>,
        _ctx: ExecutionContext,
      ) => {
        // Gather inputs from connected nodes
        let promptText = '';
        let imageUrl = '';

        for (const [_key, value] of inputs) {
          const val = value as Record<string, unknown>;
          if (val?.text) {
            promptText = val.text as string;
          }
          if (val?.image) {
            imageUrl = val.image as string;
          }
        }

        const model = (node.config.model as string) || 'nano-banana-pro';
        const aspectRatio = (node.config.aspectRatio as string) || '1:1';

        // Map model shortnames to Replicate model identifiers
        // fal.ai model map
        const falModelMap: Record<string, string> = {
          'fal-flux-dev': 'fal-ai/flux/dev',
          'fal-flux-pro': 'fal-ai/flux-pro',
          'fal-flux-schnell': 'fal-ai/flux/schnell',
        };

        // Replicate model map
        const replicateModelMap: Record<string, string> = {
          'flux-2-pro': 'black-forest-labs/flux-2-pro',
          'flux-schnell': 'black-forest-labs/flux-schnell',
          'imagen-3-fast': 'google/imagen-3-fast',
          'imagen-4-fast': 'google/imagen-4-fast',
          'nano-banana-pro': 'google/nano-banana-pro',
        };

        const input: Record<string, unknown> = {
          aspect_ratio: aspectRatio,
          prompt: promptText,
        };

        if (imageUrl) {
          input.image = imageUrl;
        }

        // Route to fal.ai if model is a fal model
        const isFalModel =
          model.startsWith('fal-') ||
          model.startsWith('fal-ai/') ||
          falModelMap[model];

        if (isFalModel && !this.falService?.isConfigured()) {
          throw new Error(
            `Fal model "${model}" requested but fal.ai is not configured. Set FAL_API_KEY or choose a Replicate model.`,
          );
        }

        if (isFalModel && this.falService?.isConfigured()) {
          const falModelId = falModelMap[model] || model;

          this.loggerService.log(
            `TelegramBotService: Running imageGen via fal.ai with model ${falModelId}`,
            { input },
          );

          const falResult = await this.falService.generateImage(falModelId, {
            image_size: { height: 1024, width: 1024 },
            prompt: promptText,
            ...(imageUrl ? { image_url: imageUrl } : {}),
          });

          return { image: falResult.url, provider: 'fal' };
        }

        // Default: Replicate
        const replicateModel = replicateModelMap[model] || model;

        this.loggerService.log(
          `TelegramBotService: Running imageGen with model ${replicateModel}`,
          { input },
        );

        // Use Replicate's run API (sync via prediction create + wait)
        const predictionId = await this.replicateService.runModel(
          replicateModel,
          input as Record<string, unknown>,
        );

        // Poll for completion
        const result = await this.pollPrediction(predictionId);

        // Result is usually a URL string or array of URLs
        const outputUrl = Array.isArray(result) ? result[0] : result;

        return { image: outputUrl, predictionId };
      },
    );

    // videoGen: calls Replicate to generate a video
    this.engine.registerExecutor(
      'videoGen',
      async (
        node: ExecutableNode,
        inputs: Map<string, unknown>,
        _ctx: ExecutionContext,
      ) => {
        let promptText = '';
        let imageUrl = '';
        let lastFrameUrl = '';

        for (const [key, value] of inputs) {
          const val = value as Record<string, unknown>;
          if (val?.text) {
            promptText = val.text as string;
          }
          if (val?.image) {
            // Distinguish first image vs lastFrame based on targetHandle
            if (key.includes('lastFrame') || key.includes('image-2')) {
              lastFrameUrl = val.image as string;
            } else if (!imageUrl) {
              imageUrl = val.image as string;
            }
          }
        }

        const model = (node.config.model as string) || 'veo-3.1-fast';
        const duration = (node.config.duration as number) || 8;
        const aspectRatio = (node.config.aspectRatio as string) || '16:9';

        const modelMap: Record<string, string> = {
          'kling-v2.1': 'kwaivgi/kling-v2.1',
          'veo-2': 'google/veo-2',
          'veo-3': 'google/veo-3',
          'veo-3-fast': 'google/veo-3-fast',
          'veo-3.1': 'google/veo-3.1',
          'veo-3.1-fast': 'google/veo-3.1-fast',
          'wan-2.2-i2v-fast': 'wan-video/wan-2.2-i2v-fast',
        };

        const replicateModel = modelMap[model] || model;

        const input: Record<string, unknown> = {
          aspect_ratio: aspectRatio,
          duration,
          prompt: promptText,
        };

        if (imageUrl) {
          input.image = imageUrl;
        }
        if (lastFrameUrl) {
          input.last_frame = lastFrameUrl;
        }

        this.loggerService.log(
          `TelegramBotService: Running videoGen with model ${replicateModel}`,
          { input },
        );

        const predictionId = await this.replicateService.runModel(
          replicateModel,
          input as Record<string, unknown>,
        );

        const result = await this.pollPrediction(predictionId);
        const outputUrl = Array.isArray(result) ? result[0] : result;

        return { predictionId, video: outputUrl };
      },
    );

    // animation: passthrough (easing is a client-side concern or future impl)
    this.engine.registerExecutor(
      'animation',
      async (
        _node: ExecutableNode,
        inputs: Map<string, unknown>,
        _ctx: ExecutionContext,
      ) => {
        // Just forward the video through
        for (const [_key, value] of inputs) {
          const val = value as Record<string, unknown>;
          if (val?.video) {
            return val;
          }
        }
        // Forward whatever came in
        const firstInput = inputs.values().next().value;
        return firstInput ?? {};
      },
    );

    // output: passthrough - collects the final result
    this.engine.registerExecutor(
      'output',
      async (
        _node: ExecutableNode,
        inputs: Map<string, unknown>,
        _ctx: ExecutionContext,
      ) => {
        // Forward all inputs as the final output
        const result: Record<string, unknown> = {};
        for (const [_key, value] of inputs) {
          const val = value as Record<string, unknown>;
          if (val) {
            Object.assign(result, val);
          }
        }
        return result;
      },
    );

    // audioInput: passthrough
    this.engine.registerExecutor(
      'audioInput',
      async (
        node: ExecutableNode,
        _inputs: Map<string, unknown>,
        _ctx: ExecutionContext,
      ) => {
        return { audio: node.config.audio as string };
      },
    );

    // videoInput: passthrough
    this.engine.registerExecutor(
      'videoInput',
      async (
        node: ExecutableNode,
        _inputs: Map<string, unknown>,
        _ctx: ExecutionContext,
      ) => {
        return { video: node.config.video as string };
      },
    );

    this.loggerService.log(
      'TelegramBotService: WorkflowEngine initialized with executors',
    );
  }

  /**
   * Poll a Replicate prediction until it completes or fails
   */
  private async pollPrediction(
    predictionId: string,
    maxWaitMs = 10 * 60 * 1000,
  ): Promise<unknown> {
    const startTime = Date.now();
    const pollIntervalMs = 3000;

    while (Date.now() - startTime < maxWaitMs) {
      const prediction = (await this.replicateService.getPrediction(
        predictionId,
      )) as ReplicatePredictionResult;

      if (
        prediction.status === 'succeeded' ||
        prediction.status === 'completed'
      ) {
        return prediction.output;
      }

      if (
        prediction.status === 'failed' ||
        prediction.status === 'canceled' ||
        prediction.status === 'error'
      ) {
        throw new Error(
          `Prediction failed: ${prediction.error || prediction.status}`,
        );
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(
      `Prediction ${predictionId} timed out after ${maxWaitMs / 1000}s`,
    );
  }

  /**
   * Convert a workflow JSON to an ExecutableWorkflow for the engine
   */
  private toExecutableWorkflow(
    workflow: WorkflowJson,
    collectedInputs: Map<string, string>,
    workflowId: string,
  ): ExecutableWorkflow {
    const nodes: ExecutableNode[] = workflow.nodes.map((node) => {
      const config = { ...node.data };

      // Inject collected inputs into node config
      const collectedValue = collectedInputs.get(node.id);
      if (collectedValue) {
        switch (node.type) {
          case 'imageInput':
          case 'telegramInput':
            config.image = collectedValue;
            break;
          case 'prompt':
            config.prompt = collectedValue;
            break;
          case 'audioInput':
            config.audio = collectedValue;
            break;
          case 'videoInput':
            config.video = collectedValue;
            break;
        }
      }

      // Find input edges for this node
      const inputEdges = workflow.edges.filter((e) => e.target === node.id);
      const inputs = inputEdges.map((e) => e.source);

      return {
        config,
        id: node.id,
        inputs,
        label: (node.data.label as string) || node.type,
        type: node.type,
      };
    });

    const edges = workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    }));

    return {
      edges,
      id: workflowId,
      lockedNodeIds: [],
      nodes,
      organizationId: 'telegram-bot',
      userId: 'telegram-bot',
    };
  }

  /**
   * Load workflow JSONs from the core workflows package
   */
  private async loadWorkflows() {
    try {
      const workflowFiles: TelegramWorkflowName[] = [
        'single-image',
        'image-series',
        'image-to-video',
        'single-video',
        'full-pipeline',
        'ugc-factory',
      ];

      for (const name of workflowFiles) {
        try {
          const filePath = this.resolveWorkflowFallbackPath(name);
          if (!filePath) {
            throw new Error(`Workflow file not found for ${name}`);
          }
          const content = await readFile(filePath, 'utf-8');
          this.workflows.set(name, JSON.parse(content) as WorkflowJson);
        } catch {
          this.loggerService.warn(
            `TelegramBotService: Could not load workflow: ${name}`,
          );
        }
      }

      this.loggerService.log(
        `TelegramBotService: Loaded ${this.workflows.size} workflows`,
      );
    } catch (error) {
      this.loggerService.error('TelegramBotService: Failed to load workflows', {
        error,
      });
    }
  }

  private resolveWorkflowFallbackPath(name: string): string | null {
    const starts = [process.cwd(), __dirname];

    for (const start of starts) {
      for (let depth = 0; depth <= 10; depth += 1) {
        const candidateRoot = resolve(start, ...Array(depth).fill('..'));
        const candidatePath = join(
          candidateRoot,
          'packages',
          'workflows',
          'workflows',
          `${name}.json`,
        );
        if (existsSync(candidatePath)) {
          return candidatePath;
        }

        const legacyCandidatePath = join(
          candidateRoot,
          'core',
          'packages',
          'workflows',
          'workflows',
          `${name}.json`,
        );
        if (existsSync(legacyCandidatePath)) {
          return legacyCandidatePath;
        }
      }
    }

    return null;
  }

  /**
   * Check if user is authorized
   */
  private isAuthorized(userId: number): boolean {
    if (this.allowedUserIds.size === 0) {
      return true;
    }
    return this.allowedUserIds.has(userId);
  }

  private extractCommandArgs(ctx: Context): string {
    const messageText =
      'message' in ctx && ctx.message && 'text' in ctx.message
        ? ctx.message.text
        : '';

    if (!messageText) {
      return '';
    }

    const firstSpace = messageText.indexOf(' ');
    if (firstSpace === -1) {
      return '';
    }

    return messageText.slice(firstSpace + 1).trim();
  }

  private resolveAuthContext(chatId: number): ChatAuthContext | null {
    return this.chatAuthContexts.get(chatId) ?? this.defaultAuthContext;
  }

  private hasRequiredScopes(
    authContext: ChatAuthContext,
    scopes: ApiKeyScope[],
  ): boolean {
    if (scopes.length === 0 || authContext.authType === RunAuthType.CLERK) {
      return true;
    }

    const availableScopes = authContext.scopes ?? [];
    if (
      availableScopes.includes(ApiKeyScope.ADMIN) ||
      availableScopes.includes('*')
    ) {
      return true;
    }

    return scopes.every((scope) => availableScopes.includes(scope));
  }

  private async resolveRunCommandContext(
    ctx: Context,
    scopes: ApiKeyScope[] = [],
  ): Promise<{ chatId: number; authContext: ChatAuthContext } | null> {
    if (!this.runsService) {
      await ctx.reply('⚠️ Run control plane is currently unavailable.');
      return null;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) {
      return null;
    }

    const authContext = this.resolveAuthContext(chatId);
    if (!authContext) {
      await ctx.reply(
        '🔐 Connect first with `/connect <api_key>` or configure default org/user context.',
        { parse_mode: ParseMode.MARKDOWN },
      );
      return null;
    }

    if (!this.hasRequiredScopes(authContext, scopes)) {
      await ctx.reply(
        '⛔ Your connected API key does not have the required scopes for this command.',
      );
      return null;
    }

    return { authContext, chatId };
  }

  private runIdFromDocument(run: unknown): string {
    if (!run || typeof run !== 'object') {
      return '';
    }

    const runRecord = run as Record<string, unknown>;
    return String(runRecord._id ?? runRecord.id ?? '');
  }

  private async createAndExecuteRun(
    ctx: Context,
    actionType: RunActionType,
    input: Record<string, unknown>,
    scopes: ApiKeyScope[] = [],
  ) {
    const runsService = this.runsService;
    if (!runsService) {
      await ctx.reply('⚠️ Run control plane is currently unavailable.');
      return;
    }

    const resolved = await this.resolveRunCommandContext(ctx, scopes);
    if (!resolved) {
      return;
    }

    const { chatId, authContext } = resolved;
    const commandArgs = this.extractCommandArgs(ctx);

    const metadata: Record<string, unknown> = {
      chatId,
      command: actionType,
      telegramUserId: ctx.from?.id,
      username: ctx.from?.username,
    };
    if (commandArgs) {
      metadata.commandArgs = commandArgs;
    }

    try {
      const { reused, run } = await runsService.createRun(
        authContext.userId,
        authContext.organizationId,
        authContext.authType,
        {
          actionType,
          correlationId: `tg:${chatId}:${Date.now()}`,
          input,
          metadata,
          surface: RunSurface.TG,
          trigger: RunTrigger.MANUAL,
        },
      );

      const runId = this.runIdFromDocument(run);
      const executedRun = runId
        ? await runsService.executeRun(runId, authContext.organizationId)
        : null;
      const runStatus =
        run && typeof run === 'object' && 'status' in run
          ? String((run as { status: unknown }).status)
          : 'pending';
      const status = executedRun?.status ?? runStatus;

      await ctx.reply(
        `✅ ${actionType.toUpperCase()} run ${reused ? 'reused' : 'started'}\n` +
          `🆔 ${runId || 'unknown'}\n` +
          `📊 Status: ${status}\n\n` +
          `Use /status ${runId || '<run_id>'} for progress.`,
      );
    } catch (error: unknown) {
      this.loggerService.error('TelegramBotService: failed to create run', {
        actionType,
        error,
      });
      await ctx.reply(
        `❌ Failed to start ${actionType} run: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Extract required inputs from a workflow
   */
  private extractInputs(workflow: WorkflowJson): WorkflowInput[] {
    const inputs: WorkflowInput[] = [];

    for (const node of workflow.nodes) {
      switch (node.type) {
        case 'imageInput':
        case 'telegramInput':
          inputs.push({
            inputType: 'image',
            label: (node.data.label as string) || 'Image',
            nodeId: node.id,
            nodeType: node.type,
            required: true,
          });
          break;
        case 'prompt':
          inputs.push({
            defaultValue: node.data.prompt as string,
            inputType: 'text',
            label: (node.data.label as string) || 'Prompt',
            nodeId: node.id,
            nodeType: node.type,
            required: true,
          });
          break;
        case 'audioInput':
          inputs.push({
            inputType: 'audio',
            label: (node.data.label as string) || 'Audio',
            nodeId: node.id,
            nodeType: node.type,
            required: true,
          });
          break;
        case 'videoInput':
          inputs.push({
            inputType: 'video',
            label: (node.data.label as string) || 'Video',
            nodeId: node.id,
            nodeType: node.type,
            required: true,
          });
          break;
      }
    }

    return inputs;
  }

  private async downloadPhotoFromTelegram(
    ctx: Context,
    fileId: string,
    chatId: number,
    nodeId: string,
  ): Promise<{ fileUrl: string; tmpPath: string }> {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${this.bot?.token}/${file.file_path}`;

    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = path.join(os.tmpdir(), 'genfeed-tg-bot');
    await fs.mkdir(tmpDir, { recursive: true });

    const ext = path.extname(file.file_path || '.jpg') || '.jpg';
    const tmpPath = path.join(
      tmpDir,
      `${chatId}-${nodeId}-${Date.now()}${ext}`,
    );

    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);

    return { fileUrl, tmpPath };
  }

  /**
   * Set up bot command and message handlers
   */
  private setupHandlers() {
    if (!this.bot) {
      return;
    }

    // Authorization middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !this.isAuthorized(userId)) {
        await ctx.reply('⛔ You are not authorized to use this bot.');
        return;
      }
      await next();
    });

    // /connect - attach org/user context via API key
    this.bot.command(TELEGRAM_BOT_CONSTANTS.COMMANDS.CONNECT, async (ctx) => {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        return;
      }

      const args = this.extractCommandArgs(ctx);

      if (args.toLowerCase() === 'disconnect') {
        this.chatAuthContexts.delete(chatId);
        await ctx.reply('🔌 Disconnected API key context for this chat.');
        return;
      }

      if (args.toLowerCase() === 'default' && this.defaultAuthContext) {
        this.chatAuthContexts.delete(chatId);
        await ctx.reply(
          '✅ Switched this chat back to default org/user context.',
        );
        return;
      }

      if (!args) {
        await ctx.reply(
          'Usage: `/connect <api_key>`\n' +
            'Optional: `/connect disconnect` to clear chat key context.',
          { parse_mode: ParseMode.MARKDOWN },
        );
        return;
      }

      if (!this.apiKeysService) {
        await ctx.reply('⚠️ API key verification service is unavailable.');
        return;
      }

      // Delete the user's message to prevent API key exposure in chat history
      try {
        await ctx.deleteMessage();
      } catch {
        // Best-effort: may fail if bot lacks delete permissions
      }

      const apiKeyRaw = args.split(/\s+/)[0];
      if (!apiKeyRaw.startsWith('gf_')) {
        await ctx.reply('❌ Invalid key format. Keys must start with `gf_`.');
        return;
      }

      const apiKey = await this.apiKeysService.findByKey(apiKeyRaw);
      if (!apiKey) {
        await ctx.reply('❌ Invalid or expired API key.');
        return;
      }

      this.chatAuthContexts.set(chatId, {
        apiKeyId: String(apiKey._id),
        authType: RunAuthType.API_KEY,
        organizationId: String(apiKey.organization),
        scopes: apiKey.scopes ?? [],
        userId: String(apiKey.user),
      });

      await ctx.reply(
        `✅ Connected.\n` +
          `🏢 Org: ${String(apiKey.organization)}\n` +
          `👤 User: ${String(apiKey.user)}\n` +
          `🔐 Scopes: ${(apiKey.scopes || []).slice(0, 8).join(', ') || 'none'}`,
      );
    });

    // Omnichannel command set (generate, post, analytics, composite run)
    this.bot.command(TELEGRAM_BOT_CONSTANTS.COMMANDS.GENERATE, async (ctx) => {
      const prompt = this.extractCommandArgs(ctx);
      if (!prompt) {
        await ctx.reply('Usage: `/generate <prompt>`', {
          parse_mode: ParseMode.MARKDOWN,
        });
        return;
      }

      const chatId = ctx.chat?.id;
      const pendingImageUrl =
        typeof chatId === 'number'
          ? this.pendingGenerationImages.get(chatId)
          : undefined;

      const input: Record<string, unknown> = { prompt };
      if (pendingImageUrl) {
        input.image = pendingImageUrl;
        input.imageUrl = pendingImageUrl;
        input.referenceImageUrl = pendingImageUrl;
        input.sourceImageUrl = pendingImageUrl;
        if (typeof chatId === 'number') {
          this.pendingGenerationImages.delete(chatId);
        }
      }

      await this.createAndExecuteRun(ctx, RunActionType.GENERATE, input, [
        ApiKeyScope.VIDEOS_CREATE,
        ApiKeyScope.IMAGES_CREATE,
      ]);
    });

    this.bot.command(TELEGRAM_BOT_CONSTANTS.COMMANDS.POST, async (ctx) => {
      const postInput = this.extractCommandArgs(ctx);
      if (!postInput) {
        await ctx.reply('Usage: `/post <content|asset_id|draft_id>`', {
          parse_mode: ParseMode.MARKDOWN,
        });
        return;
      }

      await this.createAndExecuteRun(
        ctx,
        RunActionType.POST,
        { payload: postInput },
        [ApiKeyScope.POSTS_CREATE],
      );
    });

    this.bot.command(TELEGRAM_BOT_CONSTANTS.COMMANDS.ANALYTICS, async (ctx) => {
      const target = this.extractCommandArgs(ctx);
      await this.createAndExecuteRun(
        ctx,
        RunActionType.ANALYTICS,
        { target: target || 'account' },
        [ApiKeyScope.ANALYTICS_READ],
      );
    });

    this.bot.command(TELEGRAM_BOT_CONSTANTS.COMMANDS.RUN, async (ctx) => {
      const prompt = this.extractCommandArgs(ctx);
      await this.createAndExecuteRun(
        ctx,
        RunActionType.COMPOSITE,
        {
          mode: 'generate-post-analytics',
          ...(prompt ? { prompt } : {}),
        },
        [
          ApiKeyScope.VIDEOS_CREATE,
          ApiKeyScope.IMAGES_CREATE,
          ApiKeyScope.POSTS_CREATE,
          ApiKeyScope.ANALYTICS_READ,
        ],
      );
    });

    // /start and /workflows - list available workflows
    this.bot.command(
      [
        TELEGRAM_BOT_CONSTANTS.COMMANDS.START,
        TELEGRAM_BOT_CONSTANTS.COMMANDS.WORKFLOWS,
      ],
      async (ctx) => {
        const chatId = ctx.chat?.id;
        if (chatId) {
          const state = this.conversations.get(chatId);
          if (state?.step === 'executing') {
            await ctx.reply(
              '⏳ A workflow is currently running. Please wait for it to finish or use /cancel.',
            );
            return;
          }
        }
        await this.handleWorkflowList(ctx);
      },
    );

    // /cancel - cancel current conversation
    this.bot.command(TELEGRAM_BOT_CONSTANTS.COMMANDS.CANCEL, async (ctx) => {
      const chatId = ctx.chat?.id;
      if (chatId) {
        const state = this.conversations.get(chatId);
        if (state?.step === 'executing') {
          await ctx.reply(
            '⚠️ Workflow is running and cannot be cancelled mid-execution. Please wait for it to finish.',
          );
          return;
        }
        this.conversations.delete(chatId);
        this.pendingGenerationImages.delete(chatId);
        await ctx.reply('❌ Cancelled. Send /workflows to start again.');
      }
    });

    // /status - bot status
    this.bot.command(TELEGRAM_BOT_CONSTANTS.COMMANDS.STATUS, async (ctx) => {
      const chatId = ctx.chat?.id;
      const args = this.extractCommandArgs(ctx);
      const state = chatId ? this.conversations.get(chatId) : undefined;
      const connectedContext = chatId ? this.resolveAuthContext(chatId) : null;

      if (args) {
        const runsService = this.runsService;
        if (!runsService) {
          await ctx.reply('⚠️ Run control plane is currently unavailable.');
          return;
        }

        const resolved = await this.resolveRunCommandContext(ctx, [
          ApiKeyScope.VIDEOS_READ,
          ApiKeyScope.IMAGES_READ,
          ApiKeyScope.ANALYTICS_READ,
        ]);
        if (!resolved) {
          return;
        }

        const run = await runsService.getRun(
          args,
          resolved.authContext.organizationId,
        );
        if (!run) {
          await ctx.reply(`❌ Run not found: ${args}`);
          return;
        }

        const latestEvent = run.events?.[run.events.length - 1];
        const runId = this.runIdFromDocument(run);
        await ctx.reply(
          `🧾 Run ${runId}\n` +
            `🎯 Action: ${run.actionType}\n` +
            `📍 Surface: ${run.surface}\n` +
            `📊 Status: ${run.status}\n` +
            `⏱ Progress: ${run.progress}%\n` +
            `🪪 Trigger: ${run.trigger}\n` +
            (latestEvent ? `📝 Last event: ${latestEvent.type}` : ''),
        );
        return;
      }

      let statusLine = '💤 Idle';
      if (state) {
        switch (state.step) {
          case 'selecting_workflow':
            statusLine = '📋 Selecting workflow';
            break;
          case 'collecting_inputs':
            statusLine = `📝 Collecting inputs (${state.currentInputIndex}/${state.requiredInputs.length})`;
            break;
          case 'confirming':
            statusLine = '✅ Waiting for confirmation';
            break;
          case 'executing':
            statusLine = `⏳ Running: ${state.workflowName}`;
            break;
        }
      }

      await ctx.reply(
        `🤖 GenFeed Bot\n` +
          `📦 Workflows loaded: ${this.workflows.size}\n` +
          `💬 Active conversations: ${this.conversations.size}\n` +
          `🖼 Pending image prompt: ${
            chatId
              ? this.pendingGenerationImages.has(chatId)
                ? 'yes'
                : 'no'
              : 'n/a'
          }\n` +
          `🔐 Chat context: ${
            connectedContext
              ? `${connectedContext.authType} (${connectedContext.organizationId})`
              : 'not connected'
          }\n` +
          `🔧 Engine: ${this.engine ? 'Ready' : 'Not initialized'}\n` +
          `📍 Your status: ${statusLine}\n` +
          `✅ Status: Running`,
      );
    });

    // Callback queries (inline keyboard buttons)
    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const chatId = ctx.chat?.id;
      if (!chatId) {
        return;
      }

      await ctx.answerCallbackQuery();

      // Block new workflow selection if one is running
      if (
        data.startsWith(TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.WORKFLOW_SELECT)
      ) {
        const existing = this.conversations.get(chatId);
        if (existing?.step === 'executing') {
          await ctx.reply('⏳ A workflow is already running. Please wait.');
          return;
        }
        const workflowId = data.slice(
          TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.WORKFLOW_SELECT.length,
        );
        await this.handleWorkflowSelect(ctx, chatId, workflowId);
      } else if (data === TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_RUN) {
        await this.handleConfirmRun(ctx, chatId);
      } else if (
        data === TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_CANCEL
      ) {
        this.conversations.delete(chatId);
        this.pendingGenerationImages.delete(chatId);
        await ctx.reply('❌ Cancelled. Send /workflows to start again.');
      } else if (data === TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_EDIT) {
        await this.handleEditInputs(ctx, chatId);
      }
    });

    // Photo messages (for image inputs)
    this.bot.on('message:photo', async (ctx) => {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        return;
      }

      const now = Date.now();
      const previousPhotoAt = this.recentPhotoTimestamps.get(chatId) || 0;
      if (now - previousPhotoAt < 1500) {
        await ctx.reply('⏱ Please wait a second before sending another photo.');
        return;
      }
      this.recentPhotoTimestamps.set(chatId, now);

      const state = this.conversations.get(chatId);
      const photos = ctx.message.photo;
      const bestPhoto = photos[photos.length - 1];

      if (!state || state.step !== 'collecting_inputs') {
        try {
          const { fileUrl, tmpPath } = await this.downloadPhotoFromTelegram(
            ctx,
            bestPhoto.file_id,
            chatId,
            'agent-generate',
          );

          this.pendingGenerationImages.set(chatId, fileUrl);
          this.loggerService.log(
            'TelegramBotService: Pending generation photo saved',
            { chatId, fileUrl, tmpPath },
          );

          await ctx.reply(
            '📸 Image received.\nNow send your prompt as a normal message and I will generate from it.',
          );
        } catch (error) {
          this.loggerService.error(
            'TelegramBotService: Failed to store pending generation photo',
            { error },
          );
          await ctx.reply('❌ Failed to download the photo. Please try again.');
        }
        return;
      }

      const currentInput = state.requiredInputs[state.currentInputIndex];
      if (!currentInput || currentInput.inputType !== 'image') {
        await ctx.reply(
          "I'm not expecting an image right now. Please send text.",
        );
        return;
      }

      try {
        const { fileUrl, tmpPath } = await this.downloadPhotoFromTelegram(
          ctx,
          bestPhoto.file_id,
          chatId,
          currentInput.nodeId,
        );

        // Store the Telegram file URL (Replicate can fetch from URLs)
        // We keep the local path too for potential local processing
        state.collectedInputs.set(currentInput.nodeId, fileUrl);
        state.currentInputIndex++;

        this.loggerService.log(
          `TelegramBotService: Image saved for node ${currentInput.nodeId}`,
          { fileUrl, tmpPath },
        );

        await this.promptNextInput(ctx, chatId);
      } catch (error) {
        this.loggerService.error(
          'TelegramBotService: Failed to download photo',
          { error },
        );
        await ctx.reply('❌ Failed to download the photo. Please try again.');
      }
    });

    // Text messages (for prompt/text inputs)
    this.bot.on('message:text', async (ctx) => {
      const chatId = ctx.chat?.id;
      if (!chatId || !ctx.message.text) {
        return;
      }

      // Skip if it's a command
      if (ctx.message.text.startsWith('/')) {
        return;
      }

      const state = this.conversations.get(chatId);
      if (!state) {
        const pendingImageUrl = this.pendingGenerationImages.get(chatId);
        const prompt = ctx.message.text.trim();
        if (pendingImageUrl && prompt.length > 0) {
          const input: Record<string, unknown> = {
            image: pendingImageUrl,
            imageUrl: pendingImageUrl,
            prompt,
            referenceImageUrl: pendingImageUrl,
            sourceImageUrl: pendingImageUrl,
          };

          this.pendingGenerationImages.delete(chatId);
          await this.createAndExecuteRun(ctx, RunActionType.GENERATE, input, [
            ApiKeyScope.VIDEOS_CREATE,
            ApiKeyScope.IMAGES_CREATE,
          ]);
        }
        return;
      }

      if (state.step !== 'collecting_inputs') {
        return;
      }

      const currentInput = state.requiredInputs[state.currentInputIndex];
      if (!currentInput || currentInput.inputType !== 'text') {
        await ctx.reply(
          "I'm expecting an image, not text. Please send a photo.",
        );
        return;
      }

      // Handle "default" keyword
      let text = ctx.message.text;
      if (text.toLowerCase() === 'default' && currentInput.defaultValue) {
        text = currentInput.defaultValue;
      }

      state.collectedInputs.set(currentInput.nodeId, text);
      state.currentInputIndex++;

      await this.promptNextInput(ctx, chatId);
    });
  }

  /**
   * Display available workflows as inline keyboard
   */
  private async handleWorkflowList(ctx: Context) {
    const keyboard = new InlineKeyboard();

    for (const [id, workflow] of this.workflows) {
      keyboard
        .text(
          `${workflow.name}`,
          `${TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.WORKFLOW_SELECT}${id}`,
        )
        .row();
    }

    await ctx.reply(
      '🎬 **GenFeed AI Workflows**\n\nSelect a workflow to run:',
      {
        parse_mode: ParseMode.MARKDOWN,
        reply_markup: keyboard,
      },
    );
  }

  /**
   * Handle workflow selection, start collecting inputs
   */
  private async handleWorkflowSelect(
    ctx: Context,
    chatId: number,
    workflowId: string,
  ) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      await ctx.reply('❌ Workflow not found.');
      return;
    }

    const requiredInputs = this.extractInputs(workflow);

    const state: ConversationState = {
      collectedInputs: new Map(),
      currentInputIndex: 0,
      requiredInputs,
      startedAt: Date.now(),
      step: 'collecting_inputs',
      workflow,
      workflowId,
      workflowName: workflow.name,
    };

    this.conversations.set(chatId, state);

    await ctx.reply(
      `📋 **${workflow.name}**\n${workflow.description}\n\n` +
        `This workflow needs ${requiredInputs.length} input(s). Let's collect them.`,
      { parse_mode: ParseMode.MARKDOWN },
    );

    await this.promptNextInput(ctx, chatId);
  }

  /**
   * Prompt for the next required input or move to confirmation
   */
  private async promptNextInput(ctx: Context, chatId: number) {
    const state = this.conversations.get(chatId);
    if (!state) {
      return;
    }

    // All inputs collected → confirm
    if (state.currentInputIndex >= state.requiredInputs.length) {
      state.step = 'confirming';
      await this.showConfirmation(ctx, chatId);
      return;
    }

    const input = state.requiredInputs[state.currentInputIndex];
    const progress = `(${state.currentInputIndex + 1}/${state.requiredInputs.length})`;

    switch (input.inputType) {
      case 'image':
        await ctx.reply(
          `📸 ${progress} **${input.label}**\nPlease send a photo.`,
          { parse_mode: ParseMode.MARKDOWN },
        );
        break;
      case 'text': {
        const defaultHint = input.defaultValue
          ? `\n\n_Default: "${input.defaultValue.substring(0, 100)}..."_\n\nSend your text or type \`default\` to use the default.`
          : '';
        await ctx.reply(
          `✏️ ${progress} **${input.label}**\nPlease type your text.${defaultHint}`,
          { parse_mode: ParseMode.MARKDOWN },
        );
        break;
      }
      case 'audio':
        await ctx.reply(
          `🎵 ${progress} **${input.label}**\nPlease send an audio file.`,
          { parse_mode: ParseMode.MARKDOWN },
        );
        break;
      case 'video':
        await ctx.reply(
          `🎬 ${progress} **${input.label}**\nPlease send a video.`,
          { parse_mode: ParseMode.MARKDOWN },
        );
        break;
    }
  }

  /**
   * Show confirmation with collected inputs summary
   */
  private async showConfirmation(ctx: Context, chatId: number) {
    const state = this.conversations.get(chatId);
    if (!state) {
      return;
    }

    let summary = `✅ **Ready to run: ${state.workflowName}**\n\n`;
    for (const input of state.requiredInputs) {
      const value = state.collectedInputs.get(input.nodeId);
      if (input.inputType === 'image') {
        summary += `📸 ${input.label}: Image received ✓\n`;
      } else {
        const displayValue = value
          ? value.length > 80
            ? `${value.substring(0, 80)}...`
            : value
          : '(empty)';
        summary += `✏️ ${input.label}: "${displayValue}"\n`;
      }
    }

    const keyboard = new InlineKeyboard()
      .text('▶️ Run', TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_RUN)
      .text('✏️ Edit', TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_EDIT)
      .text('❌ Cancel', TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_CANCEL);

    await ctx.reply(summary, {
      parse_mode: ParseMode.MARKDOWN,
      reply_markup: keyboard,
    });
  }

  /**
   * Execute the workflow with collected inputs using the real WorkflowEngine
   */
  private async handleConfirmRun(ctx: Context, chatId: number) {
    const state = this.conversations.get(chatId);
    if (!state || !state.workflow) {
      await ctx.reply('❌ No workflow to run. Send /workflows to start.');
      return;
    }

    if (!this.engine) {
      await ctx.reply('❌ Workflow engine is not initialized.');
      this.conversations.delete(chatId);
      return;
    }

    state.step = 'executing';

    const statusMsg = await ctx.reply(
      `⏳ **Running: ${state.workflowName}**\n` +
        `Processing ${state.workflow.nodes.length} nodes...\n\n` +
        `🔄 Starting...`,
      { parse_mode: ParseMode.MARKDOWN },
    );
    state.statusMessageId = statusMsg.message_id;

    const startTime = Date.now();

    try {
      // Convert workflow JSON → ExecutableWorkflow
      const executableWorkflow = this.toExecutableWorkflow(
        state.workflow,
        state.collectedInputs,
        state.workflowId || 'unknown',
      );

      this.loggerService.log(
        'TelegramBotService: Starting workflow execution',
        {
          chatId,
          nodeCount: executableWorkflow.nodes.length,
          workflowId: state.workflowId,
          workflowName: state.workflowName,
        },
      );

      // Execute with progress callbacks
      const result: ExecutionRunResult = await this.engine.execute(
        executableWorkflow,
        {
          onProgress: (event: ExecutionProgressEvent) => {
            // Update status message with progress
            this.updateProgressMessage(ctx, chatId, state, event).catch(() => {
              /* ignore update errors */
            });
          },
        },
      );

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      if (result.status === 'completed') {
        // Find output node results
        await this.sendResults(ctx, chatId, result, durationSec);
      } else {
        await ctx.reply(
          `❌ **Workflow failed**\n\n` +
            `Error: ${result.error || 'Unknown error'}\n` +
            `Duration: ${durationSec}s\n` +
            `Credits used: ${result.totalCreditsUsed}`,
          { parse_mode: ParseMode.MARKDOWN },
        );
      }
    } catch (error) {
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      this.loggerService.error(
        'TelegramBotService: Workflow execution failed',
        { chatId, error },
      );
      await ctx.reply(
        `❌ **Error running workflow**\n\n` +
          `${error instanceof Error ? error.message : 'Unknown error'}\n` +
          `Duration: ${durationSec}s`,
        { parse_mode: ParseMode.MARKDOWN },
      );
    } finally {
      this.conversations.delete(chatId);
    }
  }

  /**
   * Update the progress status message in Telegram
   */
  private async updateProgressMessage(
    ctx: Context,
    chatId: number,
    state: ConversationState,
    event: ExecutionProgressEvent,
  ) {
    if (!state.statusMessageId) {
      return;
    }

    const progressBar = this.renderProgressBar(event.progress);
    const currentNode = event.currentNodeLabel || event.currentNodeId || '';

    try {
      await ctx.api.editMessageText(
        chatId,
        state.statusMessageId,
        `⏳ **Running: ${state.workflowName}**\n\n` +
          `${progressBar} ${event.progress}%\n` +
          `🔧 ${currentNode}\n` +
          `✅ ${event.completedNodes.length} completed`,
        { parse_mode: ParseMode.MARKDOWN },
      );
    } catch {
      // Ignore "message not modified" errors
    }
  }

  /**
   * Render a text-based progress bar
   */
  private renderProgressBar(progress: number): string {
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Send workflow results back to the user
   */
  private async sendResults(
    ctx: Context,
    _chatId: number,
    result: ExecutionRunResult,
    durationSec: string,
  ) {
    // Collect all outputs from output nodes
    const outputs: Array<{ type: string; url: string }> = [];

    for (const [_nodeId, nodeResult] of result.nodeResults) {
      if (nodeResult.status !== 'completed' || !nodeResult.output) {
        continue;
      }

      const output = nodeResult.output as Record<string, unknown>;

      if (output.image && typeof output.image === 'string') {
        outputs.push({ type: 'image', url: output.image });
      }
      if (output.video && typeof output.video === 'string') {
        outputs.push({ type: 'video', url: output.video });
      }
    }

    // Send completion summary
    await ctx.reply(
      `✅ **Workflow completed!**\n\n` +
        `⏱ Duration: ${durationSec}s\n` +
        `💰 Credits used: ${result.totalCreditsUsed}\n` +
        `📦 Outputs: ${outputs.length} file(s)`,
      { parse_mode: ParseMode.MARKDOWN },
    );

    // Send each output file
    for (const output of outputs) {
      try {
        if (output.type === 'image') {
          await ctx.replyWithPhoto(output.url, {
            caption: '🖼 Generated Image',
          });
        } else if (output.type === 'video') {
          await ctx.replyWithVideo(output.url, {
            caption: '🎬 Generated Video',
          });
        }
      } catch (error) {
        this.loggerService.error(
          'TelegramBotService: Failed to send output file',
          { error, output },
        );
        // Fallback: send as URL
        await ctx.reply(
          `📎 ${output.type === 'image' ? '🖼' : '🎬'} Output URL: ${output.url}`,
        );
      }
    }

    if (outputs.length === 0) {
      // Send raw node outputs for debugging
      const allOutputs: string[] = [];
      for (const [nodeId, nodeResult] of result.nodeResults) {
        if (nodeResult.output) {
          allOutputs.push(
            `${nodeId}: ${JSON.stringify(nodeResult.output).substring(0, 200)}`,
          );
        }
      }
      if (allOutputs.length > 0) {
        await ctx.reply(
          `📋 **Node outputs:**\n\`\`\`\n${allOutputs.join('\n')}\n\`\`\``,
          { parse_mode: ParseMode.MARKDOWN },
        );
      }
    }
  }

  /**
   * Reset input collection for editing
   */
  private async handleEditInputs(ctx: Context, chatId: number) {
    const state = this.conversations.get(chatId);
    if (!state) {
      return;
    }

    state.step = 'collecting_inputs';
    state.currentInputIndex = 0;
    state.collectedInputs.clear();

    await ctx.reply("🔄 Let's collect inputs again.");
    await this.promptNextInput(ctx, chatId);
  }

  /**
   * Start bot in polling mode (for development)
   */
  private startPolling() {
    if (!this.bot || this.isRunning) {
      return;
    }

    try {
      this.isRunning = true;
      this.bot.start({
        onStart: () => {
          this.loggerService.log(
            'TelegramBotService: Bot started (polling mode)',
          );
        },
      });
    } catch (error) {
      this.isRunning = false;
      this.loggerService.error('TelegramBotService: Failed to start polling', {
        error,
      });
    }
  }

  /**
   * Stop the bot
   */
  stopBot() {
    if (this.bot && this.isRunning) {
      this.bot.stop();
      this.isRunning = false;
      this.loggerService.log('TelegramBotService: Bot stopped');
    }
  }

  /**
   * Handle incoming webhook update (for production)
   */
  async handleWebhookUpdate(update: unknown) {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }
    await this.bot.handleUpdate(update as Parameters<Bot['handleUpdate']>[0]);
  }

  /**
   * Get bot status info
   */
  getStatus() {
    return {
      activeConversations: this.conversations.size,
      allowedUsers: this.allowedUserIds.size || 'all',
      connectedChats: this.chatAuthContexts.size,
      engineReady: !!this.engine,
      hasDefaultContext: !!this.defaultAuthContext,
      running: this.isRunning,
      workflowsLoaded: this.workflows.size,
    };
  }

  /**
   * Get loaded workflows for external use
   */
  getWorkflows(): Map<string, WorkflowJson> {
    return this.workflows;
  }
}
