import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const DEFAULT_INCLUDE_GLOBS = [
  'apps/app/**/*.{ts,tsx}',
  'apps/desktop/**/*.{ts,tsx}',
  'apps/extensions/**/*.{ts,tsx}',
  'apps/mobile/**/*.{ts,tsx}',
  'apps/server/api/src/**/*.ts',
  'apps/server/discord/src/**/*.ts',
  'apps/server/files/src/**/*.ts',
  'apps/server/mcp/src/**/*.ts',
  'apps/server/api/src/**/*.ts',
  'apps/server/slack/src/**/*.ts',
  'apps/server/telegram/src/**/*.ts',
  'apps/server/workers/src/**/*.ts',
  'apps/website/**/*.{ts,tsx}',
  'packages/actions/src/**/*.ts',
  'packages/agent/src/**/*.ts',
  'packages/cli/src/**/*.ts',
  'packages/client/src/**/*.ts',
  'packages/services/**/*.ts',
  'packages/workflows/src/**/*.{ts,tsx}',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/__fixtures__/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/fixtures/**',
  '**/generated/**',
];

export type ProductWorkflowBoundaryClassification =
  | 'platform-maintenance'
  | 'workflow-adapter';

export type ProductWorkflowBoundaryException = {
  classification: ProductWorkflowBoundaryClassification;
  file: string;
  id: string;
  issue?: number;
  reason: string;
  systemWorkflowIds?: string[];
};

export type ProductWorkflowBoundaryDetection = {
  exceptionAllowed: boolean;
  file: string;
  ruleId: string;
  message: string;
};

export type ProductWorkflowBoundaryViolation =
  | {
      detection: ProductWorkflowBoundaryDetection;
      kind: 'undocumented-product-workflow-boundary';
      message: string;
    }
  | {
      exception: ProductWorkflowBoundaryException;
      kind: 'incomplete-exception';
      message: string;
    }
  | {
      exception: ProductWorkflowBoundaryException;
      kind: 'stale-exception';
      message: string;
    }
  | {
      exceptions: ProductWorkflowBoundaryException[];
      key: string;
      kind: 'duplicate-exception';
      message: string;
    };

export type ProductWorkflowBoundaryResult = {
  detections: ProductWorkflowBoundaryDetection[];
  documentedDetections: Array<{
    detection: ProductWorkflowBoundaryDetection;
    exception: ProductWorkflowBoundaryException;
  }>;
  violations: ProductWorkflowBoundaryViolation[];
};

export type ProductWorkflowBoundaryOptions = {
  exceptions?: ProductWorkflowBoundaryException[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

type ProductWorkflowBoundaryRule = {
  exceptionAllowed?: boolean;
  id: string;
  message: string;
  matches: (file: string, source: string) => boolean;
};

export const PRODUCT_WORKFLOW_BOUNDARY_EXCEPTIONS: ProductWorkflowBoundaryException[] =
  [
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/endpoints/admin/announcements/announcements.service.ts',
      id: 'admin-announcement-broadcast-actions',
      reason:
        'The service registers bounded Discord, X, and persistence actions used by the immutable admin announcement broadcast graph.',
      systemWorkflowIds: ['admin.announcement.broadcast'],
    },
    {
      classification: 'platform-maintenance',
      file: 'apps/server/api/src/services/notifications/notifications.service.ts',
      id: 'notification-redis-publisher',
      reason:
        'Infrastructure notification fan-out uses a Redis publisher; it does not publish customer content or orchestrate product behavior.',
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/workers/src/services/scheduled-post-delivery.service.ts',
      id: 'scheduled-post-delivery-action',
      reason:
        'Provider publishing is the bounded delivery action inside the immutable scheduled-post publish graph.',
      systemWorkflowIds: ['scheduled-post.publish'],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/collections/workflows/services/youtube-long-form-workflow.service.ts',
      id: 'youtube-long-form-actions',
      reason:
        'The service registers the atomic YouTube source, transcription, transformation, persistence, and Library-promotion executors used by the hidden graphs.',
      systemWorkflowIds: [
        'youtube-to-long-form-text',
        'youtube-source-to-library',
      ],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/workers/src/crons/posts/cron.posts.service.ts',
      id: 'scheduled-post-publishing',
      reason:
        'The scheduler discovers due posts and queues the immutable scheduled-post.publish graph; provider delivery is an atomic action node.',
      systemWorkflowIds: ['scheduled-post.publish'],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/reply-bot/reply-bot-orchestrator.service.ts',
      id: 'reply-bot-orchestration',
      reason:
        'The service registers atomic reply-bot action adapters and queues immutable organization, bot, content, DM, and test workflow graphs.',
      systemWorkflowIds: [
        'reply-bot.process-organization',
        'reply-bot.process-bot',
        'reply-bot.process-content',
        'reply-bot.send-dm',
        'reply-bot.test-generation',
      ],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/reply-bot/bot-action-executor.service.ts',
      id: 'reply-bot-action-executor',
      reason:
        'Low-level social client adapter used by workflow-backed action callers; it must not schedule product behavior itself.',
      systemWorkflowIds: [
        'author-reply.send-reply',
        'reply-bot.process-content',
        'reply-bot.send-dm',
      ],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/twitter-pipeline/twitter-pipeline.service.ts',
      id: 'twitter-pipeline-publish',
      reason:
        'Twitter original, reply, and quote publishing share the atomic provider action in the immutable twitter.pipeline.publish graph.',
      systemWorkflowIds: ['twitter.pipeline.publish'],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/collections/social-inbox/services/social-inbox-action.service.ts',
      id: 'social-inbox-manual-actions',
      reason:
        'Low-level provider adapters are registered once and invoked by the immutable social inbox outbound reply and DM workflows.',
      systemWorkflowIds: [
        'social.inbox.outbound.post-reply',
        'social.inbox.outbound.send-dm',
      ],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/campaign/campaign-executor.service.ts',
      id: 'campaign-reply-action-adapter',
      reason:
        'Atomic campaign reply target actions are sequenced by immutable batch and per-target workflows.',
      systemWorkflowIds: [
        'campaign.reply.process-pending-targets',
        'campaign.reply.execute-target',
      ],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/campaign/dm-campaign-executor.service.ts',
      id: 'campaign-dm-action-adapter',
      reason:
        'Atomic campaign DM target actions are sequenced by immutable batch and per-target workflows.',
      systemWorkflowIds: [
        'campaign.dm.process-pending-targets',
        'campaign.dm.execute-target',
      ],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/workers/src/crons/engagement/cron.engagement-triggers.service.ts',
      id: 'engagement-sweep-actions',
      reason:
        'Atomic engagement adapters are sequenced by the hidden sweep and per-rule workflow graphs.',
      systemWorkflowIds: ['engagement.sweep', 'engagement.rule.process'],
    },
  ];

const PRODUCT_CRON_PATH_SEGMENTS = ['/content-pipeline/', '/posts/'];

const PRODUCT_WORKFLOW_BOUNDARY_RULES: ProductWorkflowBoundaryRule[] = [
  {
    exceptionAllowed: false,
    id: 'retired-facecam-provider-orchestration-actions',
    matches: (_file, source) =>
      /workspace\.task\.facecam\.(?:attach-output|record-dispatch|schedule-poll)/.test(
        source,
      ),
    message:
      'Facecam provider completion is owned by the durable workflow continuation. Attach, dispatch-recording, and poll-scheduling action planes are retired.',
  },
  {
    exceptionAllowed: false,
    id: 'retired-api-workflow-executor-plane',
    matches: (file) =>
      file.startsWith('apps/server/api/src/services/workflow-executor/'),
    message:
      'The parallel API workflow-executor processor plane is retired. Product behavior must be registered as action-backed nodes in the shared workflow engine.',
  },
  {
    exceptionAllowed: false,
    id: 'literal-placeholder-product-mutation',
    matches: (_file, source) =>
      /caption\s*:\s*`Generated caption for topic:/s.test(source),
    message:
      'Product mutation endpoints cannot return literal placeholder generation results. Delete the surface or route it through a real action-backed workflow.',
  },
  {
    exceptionAllowed: false,
    id: 'workflow-entry-action-used-as-internal-node',
    matches: (_file, source) =>
      /(?:registerAction\s*\(\s*|actionId\s*:\s*)(?:ARTICLE_GENERATION_(?:ACTION|TOOL)_ID|LINKEDIN_CONTENT_GENERATION_(?:ACTION|TOOL)_ID|['"](?:create_article|generate_linkedin_content)['"])/s.test(
        source,
      ),
    message:
      'Workflow-entry tool IDs cannot be reused for a differently shaped internal node. Give the atomic node its own stable action ID and exact contract.',
  },
  {
    exceptionAllowed: false,
    id: 'brand-remix-generation-bypasses-workflow',
    matches: (file, source) =>
      file.endsWith(
        '/collections/content-runs/services/brand-remix-run-execution.service.ts',
      ) &&
      /async start\s*\(/.test(source) &&
      !/runWorkflow\s*</.test(source),
    message:
      'Brand Remix generation must start an immutable WorkflowExecution; do not dispatch variants from the entry surface.',
  },
  {
    exceptionAllowed: false,
    id: 'content-plan-item-macro-executor',
    matches: (_file, source) =>
      /content\.production\.engine\.execute-plan-item/.test(source),
    message:
      'Content-plan items must run through skill and mediaquery actions. The execute-plan-item macro is retired.',
  },
  {
    exceptionAllowed: false,
    id: 'dynamic-system-action-workflow',
    matches: (_file, source) =>
      /\.\s*runAction\s*(?:<[^;{]*?>)?\s*\(/s.test(source) ||
      /\.\s*queueSystemAction\s*\(/.test(source) ||
      /\bcreateSystemActionWorkflowDefinition\s*\(/.test(source),
    message:
      'Dynamic single-action workflow wrappers are retired. Register and execute an explicit immutable workflow graph.',
  },
  {
    exceptionAllowed: false,
    id: 'serialized-system-workflow-definition',
    matches: (_file, source) =>
      /\.\s*(?:queueSystemWorkflowDefinition|runWorkflowDefinition|startWorkflowDefinition)\s*\(/.test(
        source,
      ),
    message:
      'Runtime and queued callers may reference only a registered canonical workflow ID; serialized graph execution is retired.',
  },
  {
    exceptionAllowed: false,
    id: 'persisted-hidden-system-workflow-clone',
    matches: (file, source) =>
      file.endsWith('/system-workflow-runner.service.ts') &&
      (/\bensureSystemWorkflow\s*\(/.test(source) ||
        /createVersionedWorkflow\s*\([\s\S]{0,2400}\borganizationId\s*:\s*(?:input\.)?organizationId\b/.test(
          source,
        )),
    message:
      'Hidden system graphs are code-owned and must not create per-organization Workflow clones.',
  },
  {
    exceptionAllowed: false,
    id: 'empty-internal-action-contract',
    matches: (file, source) =>
      file.startsWith('packages/actions/src/') &&
      /inputSchema\s*:\s*(?:OBJECT_SCHEMA\b|\{\s*type\s*:\s*['"]object['"]\s*,\s*properties\s*:\s*\{\s*\}\s*\})/s.test(
        source,
      ) &&
      /outputSchema\s*:\s*(?:ANY_SCHEMA\b|\{\s*\})/s.test(source),
    message:
      'Registered product actions require concrete JSON-schema input and output contracts; empty internal-action placeholders are retired.',
  },
  {
    exceptionAllowed: false,
    id: 'hand-written-product-node-inventory',
    matches: (file, source) =>
      file.startsWith('packages/workflows/') &&
      (/\bSAAS_NODE_DEFINITIONS\b/.test(source) ||
        /\bDEFAULT_WORKFLOW_GENERATION_NODE_TYPES\b/.test(source) ||
        /\bNODE_CATEGORY_MAP\b/.test(source)),
    message:
      'Action-backed workflow node metadata must be generated from the action catalog; do not reintroduce a hand-written product node inventory in packages/workflows.',
  },
  {
    exceptionAllowed: false,
    id: 'mcp-direct-workflow-execution-adapter',
    matches: (file, source) =>
      file === 'apps/server/mcp/src/services/client/workflow.client.ts' &&
      /\bexecuteWorkflow\s*\(/.test(source),
    message:
      'MCP must invoke workflows through the curated Agent workflow executor; a second direct workflow-execution client is not allowed.',
  },
  {
    id: 'youtube-long-form-direct-orchestration',
    matches: (file, source) =>
      (file.includes('youtube-long-form') ||
        source.includes('YOUTUBE_LONG_FORM_WORKFLOW_ID')) &&
      /\b(?:FileQueueService|OpenRouterService|WhisperService|ArticlesService|NewslettersService)\b/.test(
        source,
      ),
    message:
      'YouTube long-form provider and persistence calls must stay inside the documented action adapter invoked by the registered hidden workflow.',
  },
  {
    id: 'direct-publish-call',
    matches: (_file, source) => /\bpublisher\.publish\s*\(/.test(source),
    message:
      'Direct publish calls must be isolated inside a documented workflow action adapter.',
  },
  {
    id: 'reply-bot-action-call',
    matches: (_file, source) =>
      /\bbotActionExecutorService\s*\.\s*(?:postReply|sendDm|postTweet|postQuoteTweet)\s*\(/.test(
        source,
      ),
    message:
      'Direct reply/DM/social action calls must be isolated inside a documented workflow action adapter.',
  },
  {
    id: 'direct-social-client-action',
    matches: (_file, source) =>
      /\bclient\.v2\.tweet\s*\(/.test(source) ||
      /\b(?:sendInstagramDm|postInstagramComment)\s*\(/.test(source),
    message:
      'Direct social API actions must be isolated inside a documented workflow action adapter.',
  },
  {
    id: 'social-inbox-direct-platform-action',
    matches: (file, source) =>
      (file.startsWith('apps/server/api/src/collections/social-inbox/') ||
        file.startsWith('apps/server/api/src/collections/social-inbox/')) &&
      (/\byoutubeService\s*\.\s*postCommentReply\s*\(/.test(source) ||
        /\binstagramService\s*\.\s*(?:replyToComment|sendCommentReplyDm)\s*\(/.test(
          source,
        )),
    message:
      'Social inbox reply/DM platform actions must run through workflow execution or be documented as a bounded migration exception.',
  },
  {
    id: 'engagement-rule-direct-action',
    matches: (file, source) =>
      file ===
        'apps/server/workers/src/crons/engagement/cron.engagement-triggers.service.ts' &&
      (/\bpostGroupsService\s*\.\s*(?:create|publishNow)\s*\(/.test(source) ||
        /\bpostComment\s*\(/.test(source)),
    message:
      'Engagement rule product actions must be isolated inside a registered workflow action.',
  },
  {
    id: 'rss-source-direct-poll',
    matches: (file, source) =>
      file ===
        'apps/server/workers/src/crons/rss/cron.rss-autopost.service.ts' &&
      /\brssSourcesService\s*\.\s*pollSource\s*\(/.test(source),
    message:
      'RSS source polling must be isolated inside a registered workflow action.',
  },
  {
    id: 'youtube-comments-direct-ingest',
    matches: (file, source) =>
      file ===
        'apps/server/workers/src/crons/youtube/cron.youtube-messages.service.ts' &&
      /\bsocialInboxService\s*\.\s*ingestYoutubeComments\s*\(/.test(source),
    message:
      'YouTube social-inbox ingestion must be isolated inside a registered workflow action.',
  },
  {
    id: 'product-cron-service',
    matches: (file) =>
      file.startsWith('apps/server/workers/src/crons/') &&
      file.endsWith('.service.ts') &&
      PRODUCT_CRON_PATH_SEGMENTS.some((segment) => file.includes(segment)),
    message:
      'Product cron-like services must be workflow adapters or platform maintenance.',
  },
];

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function exceptionKey(exception: ProductWorkflowBoundaryException): string {
  return normalizePath(exception.file);
}

function hasSystemWorkflowReplacement(
  exception: ProductWorkflowBoundaryException,
): boolean {
  return Boolean(exception.systemWorkflowIds?.some((id) => id.trim()));
}

function validateException(
  exception: ProductWorkflowBoundaryException,
  violations: ProductWorkflowBoundaryViolation[],
): void {
  if (
    exception.classification === 'workflow-adapter' &&
    !hasSystemWorkflowReplacement(exception)
  ) {
    violations.push({
      exception,
      kind: 'incomplete-exception',
      message:
        'Workflow adapter exceptions must name at least one system workflow id.',
    });
    return;
  }
}

function detectProductWorkflowBoundaries(
  filePath: string,
  rootDir: string,
): ProductWorkflowBoundaryDetection[] {
  const file = normalizePath(path.relative(rootDir, filePath));
  const source = readFileSync(filePath, 'utf8');

  return PRODUCT_WORKFLOW_BOUNDARY_RULES.filter((rule) =>
    rule.matches(file, source),
  ).map((rule) => ({
    exceptionAllowed: rule.exceptionAllowed ?? true,
    file,
    message: rule.message,
    ruleId: rule.id,
  }));
}

export function runCheckProductWorkflowBoundary(
  options: ProductWorkflowBoundaryOptions = {},
): ProductWorkflowBoundaryResult {
  const rootDir = options.rootDir ?? process.cwd();
  const includeGlobs = options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS;
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;
  const exceptions = options.exceptions ?? PRODUCT_WORKFLOW_BOUNDARY_EXCEPTIONS;

  const violations: ProductWorkflowBoundaryViolation[] = [];
  const exceptionMap = new Map<string, ProductWorkflowBoundaryException>();

  for (const exception of exceptions) {
    const key = exceptionKey(exception);
    const existing = exceptionMap.get(key);

    if (existing) {
      violations.push({
        exceptions: [existing, exception],
        key,
        kind: 'duplicate-exception',
        message:
          'Product workflow boundary manifest contains duplicate file entries.',
      });
      continue;
    }

    exceptionMap.set(key, exception);
    validateException(exception, violations);
  }

  const files = globSync(includeGlobs, {
    absolute: true,
    cwd: rootDir,
    ignore: ignoreGlobs,
    nodir: true,
  }).sort();

  const detections = files.flatMap((filePath) =>
    detectProductWorkflowBoundaries(filePath, rootDir),
  );
  const documentedDetections: ProductWorkflowBoundaryResult['documentedDetections'] =
    [];
  const detectedFiles = new Set<string>();

  for (const detection of detections) {
    detectedFiles.add(detection.file);
    const exception = exceptionMap.get(detection.file);

    if (!exception || !detection.exceptionAllowed) {
      violations.push({
        detection,
        kind: 'undocumented-product-workflow-boundary',
        message: detection.exceptionAllowed
          ? 'Hardcoded product automation must route through a workflow-backed action or be an explicitly documented low-level action adapter.'
          : 'This hard-cut workflow boundary cannot be bypassed with an exception.',
      });
      continue;
    }

    documentedDetections.push({ detection, exception });
  }

  for (const exception of exceptionMap.values()) {
    if (!detectedFiles.has(exceptionKey(exception))) {
      violations.push({
        exception,
        kind: 'stale-exception',
        message:
          'Product workflow boundary exception no longer matches a detected hardcoded path. Remove or update the manifest entry.',
      });
    }
  }

  return { detections, documentedDetections, violations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckProductWorkflowBoundary();

  if (result.violations.length > 0) {
    console.error('Product workflow boundary violations found.');

    for (const violation of result.violations) {
      if (violation.kind === 'undocumented-product-workflow-boundary') {
        console.error(
          `- ${violation.detection.file}: ${violation.detection.message}`,
        );
        continue;
      }

      if (violation.kind === 'stale-exception') {
        console.error(`- ${violation.exception.file}: ${violation.message}`);
        continue;
      }

      if (violation.kind === 'incomplete-exception') {
        console.error(`- ${violation.exception.file}: ${violation.message}`);
        continue;
      }

      console.error(`- ${violation.key}: ${violation.message}`);
    }

    console.error(
      '\nRoute product automation through workflows and isolate unavoidable provider calls inside a documented action adapter.',
    );
    process.exit(1);
  }

  console.log(
    `Product workflow boundary passed. ${result.documentedDetections.length} documented product automation boundary detection(s).`,
  );
}
