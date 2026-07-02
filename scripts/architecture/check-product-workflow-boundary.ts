import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const DEFAULT_INCLUDE_GLOBS = [
  'apps/server/api/src/collections/social-inbox/**/*.ts',
  'apps/server/api/src/services/campaign/**/*.ts',
  'apps/server/api/src/services/reply-bot/**/*.ts',
  'apps/server/api/src/services/twitter-pipeline/**/*.ts',
  'apps/server/workers/src/crons/**/*.ts',
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
  | 'pending-system-workflow-migration'
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
  id: string;
  message: string;
  matches: (file: string, source: string) => boolean;
};

export const PRODUCT_WORKFLOW_BOUNDARY_EXCEPTIONS: ProductWorkflowBoundaryException[] =
  [
    {
      classification: 'workflow-adapter',
      file: 'apps/server/workers/src/crons/posts/cron.posts.service.ts',
      id: 'scheduled-post-publishing',
      reason:
        'Scheduled publish dispatch is wrapped by scheduled-post-publishing system workflow executions with post provenance.',
      systemWorkflowIds: ['scheduled-post-publishing'],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/reply-bot/reply-bot-orchestrator.service.ts',
      id: 'reply-bot-orchestration',
      reason:
        'Reply/DM social actions are wrapped by reply-dm-automation system workflow executions.',
      systemWorkflowIds: ['reply-dm-automation'],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/reply-bot/bot-action-executor.service.ts',
      id: 'reply-bot-action-executor',
      reason:
        'Low-level social client adapter used by workflow-backed action callers; it must not schedule product behavior itself.',
      systemWorkflowIds: ['reply-dm-automation'],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/twitter-pipeline/twitter-pipeline.service.ts',
      id: 'twitter-pipeline-publish',
      reason:
        'Twitter original/reply/quote publish actions are wrapped by twitter-publish-action system workflow executions.',
      systemWorkflowIds: ['twitter-publish-action'],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/campaign/campaign-executor.service.ts',
      id: 'campaign-reply-automation',
      reason:
        'Outreach campaign replies are wrapped by campaign-reply-automation system workflow executions.',
      systemWorkflowIds: ['campaign-reply-automation'],
    },
    {
      classification: 'workflow-adapter',
      file: 'apps/server/api/src/services/campaign/dm-campaign-executor.service.ts',
      id: 'campaign-dm-automation',
      reason:
        'Outreach campaign DMs are wrapped by campaign-dm-automation system workflow executions.',
      systemWorkflowIds: ['campaign-dm-automation'],
    },
    {
      classification: 'pending-system-workflow-migration',
      file: 'apps/server/api/src/collections/social-inbox/services/social-inbox.service.ts',
      id: 'social-inbox-manual-actions',
      issue: 1032,
      reason:
        'Manual social inbox reply/DM endpoints still dispatch directly while reply and DM actions move behind workflow execution.',
      systemWorkflowIds: ['reply-dm-automation'],
    },
    {
      classification: 'pending-system-workflow-migration',
      file: 'apps/server/workers/src/crons/dynamic-jobs/cron.dynamic-jobs.service.ts',
      id: 'legacy-dynamic-jobs-dispatcher',
      issue: 1011,
      reason:
        'Legacy dynamic job dispatcher can still run non-workflow product jobs while old rows exist.',
      systemWorkflowIds: ['legacy-cron-workflow-adapter'],
    },
    {
      classification: 'pending-system-workflow-migration',
      file: 'apps/server/workers/src/crons/reply-bot/cron.reply-bot.service.ts',
      id: 'reply-bot-cron',
      issue: 1011,
      reason:
        'Reply bot polling cron remains a hardcoded product scheduling path until reply/DM workflows own polling and dispatch.',
      systemWorkflowIds: ['reply-dm-automation'],
    },
    {
      classification: 'pending-system-workflow-migration',
      file: 'apps/server/workers/src/crons/content-engine/cron.content-engine.service.ts',
      id: 'content-engine-cron',
      issue: 1011,
      reason:
        'Content engine cron-like worker remains a product automation path pending system workflow migration.',
      systemWorkflowIds: ['content-engine-automation'],
    },
    {
      classification: 'pending-system-workflow-migration',
      file: 'apps/server/workers/src/crons/content-schedules/cron.content-schedules.service.ts',
      id: 'content-schedules-cron',
      issue: 1011,
      reason:
        'Content schedules worker remains a product automation path pending system workflow migration.',
      systemWorkflowIds: ['content-schedule-workflow'],
    },
    {
      classification: 'pending-system-workflow-migration',
      file: 'apps/server/workers/src/crons/content-pipeline/cron.content-pipeline.service.ts',
      id: 'content-pipeline-cron',
      issue: 1011,
      reason:
        'Content pipeline autopilot remains a product automation path pending system workflow migration.',
      systemWorkflowIds: ['content-pipeline-automation'],
    },
    {
      classification: 'pending-system-workflow-migration',
      file: 'apps/server/workers/src/crons/agent/cron.proactive-agent.service.ts',
      id: 'proactive-agent-cron',
      issue: 1011,
      reason:
        'Proactive agent cron-like worker remains a product automation path pending workflow-backed agent migration.',
      systemWorkflowIds: ['agent-autopilot'],
    },
    {
      classification: 'pending-system-workflow-migration',
      file: 'apps/server/workers/src/crons/agent-campaign/cron.agent-campaign-orchestrator.service.ts',
      id: 'agent-campaign-orchestration-cron',
      issue: 1011,
      reason:
        'Agent campaign orchestration worker remains documented until campaign orchestration is fully workflow-backed.',
      systemWorkflowIds: ['campaign-orchestration'],
    },
  ];

const PRODUCT_CRON_PATH_SEGMENTS = [
  '/agent/',
  '/agent-campaign/',
  '/content-engine/',
  '/content-pipeline/',
  '/content-schedules/',
  '/dynamic-jobs/',
  '/posts/',
  '/reply-bot/',
];

const PRODUCT_WORKFLOW_BOUNDARY_RULES: ProductWorkflowBoundaryRule[] = [
  {
    id: 'direct-publish-call',
    matches: (_file, source) => /\bpublisher\.publish\s*\(/.test(source),
    message:
      'Direct publish calls must be workflow-backed or documented as a system workflow migration.',
  },
  {
    id: 'reply-bot-action-call',
    matches: (_file, source) =>
      /\bbotActionExecutorService\s*\.\s*(?:postReply|sendDm|postTweet|postQuoteTweet)\s*\(/.test(
        source,
      ),
    message:
      'Direct reply/DM/social action calls must run through workflow execution or be documented as a system workflow migration.',
  },
  {
    id: 'direct-social-client-action',
    matches: (_file, source) =>
      /\bclient\.v2\.tweet\s*\(/.test(source) ||
      /\b(?:sendInstagramDm|postInstagramComment)\s*\(/.test(source),
    message:
      'Direct social API actions must be isolated behind workflow nodes or documented as pending migration.',
  },
  {
    id: 'social-inbox-direct-platform-action',
    matches: (file, source) =>
      file.startsWith('apps/server/api/src/collections/social-inbox/') &&
      (/\byoutubeService\s*\.\s*postCommentReply\s*\(/.test(source) ||
        /\binstagramService\s*\.\s*(?:replyToComment|sendCommentReplyDm)\s*\(/.test(
          source,
        )),
    message:
      'Social inbox reply/DM platform actions must run through workflow execution or be documented as a bounded migration exception.',
  },
  {
    id: 'product-cron-service',
    matches: (file) =>
      file.startsWith('apps/server/workers/src/crons/') &&
      file.endsWith('.service.ts') &&
      PRODUCT_CRON_PATH_SEGMENTS.some((segment) => file.includes(segment)),
    message:
      'Product cron-like services must be workflow adapters, platform maintenance, or pending system workflow migrations.',
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

  if (exception.classification !== 'pending-system-workflow-migration') {
    return;
  }

  if (!exception.issue || !hasSystemWorkflowReplacement(exception)) {
    violations.push({
      exception,
      kind: 'incomplete-exception',
      message:
        'Pending product automation migrations must name an issue and at least one replacement system workflow id.',
    });
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

    if (!exception) {
      violations.push({
        detection,
        kind: 'undocumented-product-workflow-boundary',
        message:
          'Hardcoded product automation must route through a system workflow or be documented as a bounded migration exception.',
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
      '\nRoute product automation through system workflows, or document a bounded pending migration with issue and replacement workflow id.',
    );
    process.exit(1);
  }

  console.log(
    `Product workflow boundary passed. ${result.documentedDetections.length} documented product automation boundary detection(s).`,
  );
}
