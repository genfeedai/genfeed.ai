import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ProductWorkflowBoundaryException,
  runCheckProductWorkflowBoundary,
} from './check-product-workflow-boundary';

describe('check-product-workflow-boundary', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'product-workflow-check-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags undocumented direct product publish paths', () => {
    writeFixture(
      'apps/server/workers/src/crons/posts/cron.posts.service.ts',
      `
        export class CronPostsService {
          async publishScheduledPosts(): Promise<void> {
            await publisher.publish({ id: 'post-1' });
          }
        }
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'undocumented-product-workflow-boundary',
        }),
      ]),
    );
  });

  it('rejects dynamic single-action workflow wrappers repository-wide', () => {
    writeFixture(
      'apps/server/api/src/collections/articles/articles.service.ts',
      `
        export class ArticlesService {
          async generate(): Promise<void> {
            await this.workflowRunner.runAction({ canonicalId: 'article.generate' });
          }
        }
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detection: expect.objectContaining({
            ruleId: 'dynamic-system-action-workflow',
          }),
          kind: 'undocumented-product-workflow-boundary',
        }),
      ]),
    );
  });

  it('rejects retired API workflow processors and placeholder mutations', () => {
    writeFixture(
      'apps/server/api/src/services/workflow-executor/processors/legacy.processor.ts',
      `
        export class LegacyProcessor {
          process(): void {}
        }
      `,
    );
    writeFixture(
      'apps/server/api/src/collections/personas/personas.controller.ts',
      `
        export class PersonasController {
          generateCaption(topic: string) {
            return { caption: \`Generated caption for topic: \${topic}\` };
          }
        }
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'retired-api-workflow-executor-plane',
        }),
        expect.objectContaining({
          ruleId: 'literal-placeholder-product-mutation',
        }),
      ]),
    );
    expect(result.violations).toHaveLength(2);
  });

  it('rejects the retired facecam callback orchestration actions', () => {
    writeFixture(
      'apps/server/api/src/services/task-orchestration/legacy-facecam.ts',
      `runner.registerAction('workspace.task.facecam.schedule-poll', schedulePoll);`,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.violations).toEqual([
      expect.objectContaining({
        detection: expect.objectContaining({
          ruleId: 'retired-facecam-provider-orchestration-actions',
        }),
      }),
    ]);
  });

  it('rejects workflow-entry IDs reused as internal node actions', () => {
    writeFixture(
      'apps/server/api/src/collections/articles/articles.service.ts',
      `
        const ARTICLE_GENERATION_TOOL_ID = 'create_article';
        runner.registerAction(ARTICLE_GENERATION_TOOL_ID, persistDraft);
      `,
    );
    writeFixture(
      'apps/server/api/src/collections/content-intelligence/content-generator.service.ts',
      `
        createGenfeedActionNode({
          actionId: 'generate_linkedin_content',
          id: 'persist-pattern',
        });
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'workflow-entry-action-used-as-internal-node',
        }),
        expect.objectContaining({
          ruleId: 'workflow-entry-action-used-as-internal-node',
        }),
      ]),
    );
    expect(result.violations).toEqual([
      expect.objectContaining({
        detection: expect.objectContaining({
          ruleId: 'workflow-entry-action-used-as-internal-node',
        }),
      }),
      expect.objectContaining({
        detection: expect.objectContaining({
          ruleId: 'workflow-entry-action-used-as-internal-node',
        }),
      }),
    ]);
  });

  it('does not allow exceptions for dynamic single-action workflow wrappers', () => {
    const file =
      'apps/server/api/src/collections/content-runs/brand-remix.service.ts';
    writeFixture(
      file,
      `
        export class BrandRemixService {
          async run(): Promise<void> {
            await this.workflowQueue.queueSystemAction({}, 'job-1');
          }
        }
      `,
    );

    const exceptions: ProductWorkflowBoundaryException[] = [
      {
        classification: 'workflow-adapter',
        file,
        id: 'brand-remix',
        reason: 'A purported adapter cannot preserve a retired API.',
        systemWorkflowIds: ['brand-remix.execute'],
      },
    ];

    const result = runCheckProductWorkflowBoundary({ exceptions });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detection: expect.objectContaining({
            ruleId: 'dynamic-system-action-workflow',
          }),
          kind: 'undocumented-product-workflow-boundary',
        }),
      ]),
    );
    expect(result.documentedDetections).toHaveLength(0);
  });

  it('rejects serialized system workflow graphs from MCP and Website surfaces', () => {
    writeFixture(
      'apps/server/mcp/src/services/youtube-long-form.service.ts',
      `
        export async function run(queue): Promise<void> {
          await queue.queueSystemWorkflowDefinition({ nodes: [], edges: [] });
        }
      `,
    );
    writeFixture(
      'apps/website/app/tools/youtube-long-form/action.ts',
      `
        export async function run(runner): Promise<void> {
          await runner.runWorkflowDefinition({ nodes: [], edges: [] });
        }
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'apps/server/mcp/src/services/youtube-long-form.service.ts',
          ruleId: 'serialized-system-workflow-definition',
        }),
        expect.objectContaining({
          file: 'apps/website/app/tools/youtube-long-form/action.ts',
          ruleId: 'serialized-system-workflow-definition',
        }),
      ]),
    );
    expect(result.violations).toHaveLength(2);
  });

  it('rejects persisted hidden workflow clones and empty action contracts', () => {
    writeFixture(
      'apps/server/api/src/collections/workflows/system-workflow-runner.service.ts',
      `
        async function ensureSystemWorkflow(definition, organizationId, userId) {
          return createVersionedWorkflow(transaction, {
            organizationId: organizationId,
            userId,
          });
        }
      `,
    );
    writeFixture(
      'packages/actions/src/registry/internal.ts',
      `
        const action = {
          inputSchema: { type: 'object', properties: {} },
          outputSchema: {},
        };
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.detections.map((detection) => detection.ruleId)).toEqual(
      expect.arrayContaining([
        'persisted-hidden-system-workflow-clone',
        'empty-internal-action-contract',
      ]),
    );
    expect(result.violations).toHaveLength(2);
  });

  it('allows one code-owned hidden workflow mirror under a fixed principal', () => {
    writeFixture(
      'apps/server/api/src/collections/workflows/system-workflow-runner.service.ts',
      `
        const SYSTEM_WORKFLOW_PRINCIPAL_ID = 'genfeed-public-tools';
        const metadata = { sourceType: 'hidden-system-workflow' };
        async function ensureHiddenSystemWorkflowMirror(definition) {
          return createVersionedWorkflow(transaction, {
            organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
            userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          });
        }
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.detections).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it('rejects empty action contracts hidden behind shared schema constants', () => {
    writeFixture(
      'packages/actions/src/registry/action-registry.ts',
      `
        const OBJECT_SCHEMA = { type: 'object', properties: {} };
        const ANY_SCHEMA = {};
        const action = {
          inputSchema: OBJECT_SCHEMA,
          outputSchema: ANY_SCHEMA,
        };
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.detections).toEqual([
      expect.objectContaining({ ruleId: 'empty-internal-action-contract' }),
    ]);
    expect(result.violations).toHaveLength(1);
  });

  it('rejects the dormant MCP direct workflow execution client', () => {
    writeFixture(
      'apps/server/mcp/src/services/client/workflow.client.ts',
      `
        export class WorkflowClient {
          executeWorkflow(): Promise<void> {
            return Promise.resolve();
          }
        }
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.detections).toEqual([
      expect.objectContaining({
        ruleId: 'mcp-direct-workflow-execution-adapter',
      }),
    ]);
    expect(result.violations).toHaveLength(1);
  });

  it('allows the documented YouTube long-form action adapter only', () => {
    const file =
      'apps/server/api/src/collections/workflows/services/youtube-long-form-workflow.service.ts';
    writeFixture(
      file,
      `
        import { FileQueueService } from './file-queue';
        const YOUTUBE_LONG_FORM_WORKFLOW_ID = 'youtube-to-long-form-text';
      `,
    );
    const exceptions: ProductWorkflowBoundaryException[] = [
      {
        classification: 'workflow-adapter',
        file,
        id: 'youtube-long-form-actions',
        reason: 'Fixture action adapter.',
        systemWorkflowIds: [
          'youtube-to-long-form-text',
          'youtube-source-to-library',
        ],
      },
    ];

    const result = runCheckProductWorkflowBoundary({ exceptions });

    expect(result.violations).toHaveLength(0);
    expect(result.documentedDetections).toEqual([
      expect.objectContaining({
        detection: expect.objectContaining({
          ruleId: 'youtube-long-form-direct-orchestration',
        }),
      }),
    ]);
  });

  it('allows documented workflow adapters with a replacement system workflow id', () => {
    writeFixture(
      'apps/server/api/src/services/reply-bot/orchestrator.service.ts',
      `
        export class ReplyBotOrchestrator {
          async run(): Promise<void> {
            await this.botActionExecutorService.sendDm({}, 'user-1', 'hello');
          }
        }
      `,
    );

    const exceptions: ProductWorkflowBoundaryException[] = [
      {
        classification: 'workflow-adapter',
        file: 'apps/server/api/src/services/reply-bot/orchestrator.service.ts',
        id: 'reply-bot',
        issue: 1011,
        reason: 'Fixture workflow adapter.',
        systemWorkflowIds: ['reply-bot.send-dm'],
      },
    ];

    const result = runCheckProductWorkflowBoundary({ exceptions });

    expect(result.violations).toHaveLength(0);
    expect(result.documentedDetections).toHaveLength(1);
  });

  it('flags undocumented social inbox platform reply and DM actions', () => {
    writeFixture(
      'apps/server/api/src/collections/social-inbox/services/social-inbox.service.ts',
      `
        export class SocialInboxService {
          async postReply(): Promise<void> {
            await this.youtubeService.postCommentReply('org-1', 'brand-1', 'comment-1', 'hello');
          }

          async sendDm(): Promise<void> {
            await this.instagramService.sendCommentReplyDm('org-1', 'brand-1', 'user-1', 'hello');
          }
        }
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'undocumented-product-workflow-boundary',
        }),
      ]),
    );
    expect(result.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'social-inbox-direct-platform-action',
        }),
      ]),
    );
  });

  it('flags direct social inbox platform actions from the server source root', () => {
    writeFixture(
      'apps/server/api/src/collections/social-inbox/services/social-inbox.service.ts',
      `
        export class SocialInboxService {
          async postReply(): Promise<void> {
            await this.youtubeService.postCommentReply('org-1', 'brand-1', 'comment-1', 'hello');
          }
        }
      `,
    );

    const result = runCheckProductWorkflowBoundary({ exceptions: [] });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'undocumented-product-workflow-boundary',
        }),
      ]),
    );
    expect(result.detections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'apps/server/api/src/collections/social-inbox/services/social-inbox.service.ts',
          ruleId: 'social-inbox-direct-platform-action',
        }),
      ]),
    );
  });

  it('allows documented social inbox workflow adapters', () => {
    writeFixture(
      'apps/server/api/src/collections/social-inbox/services/social-inbox.service.ts',
      `
        export class SocialInboxService {
          async postReply(): Promise<void> {
            await this.instagramService.replyToComment('org-1', 'brand-1', 'comment-1', 'hello');
          }
        }
      `,
    );

    const exceptions: ProductWorkflowBoundaryException[] = [
      {
        classification: 'workflow-adapter',
        file: 'apps/server/api/src/collections/social-inbox/services/social-inbox.service.ts',
        id: 'social-inbox-actions',
        issue: 1032,
        reason: 'Fixture social inbox workflow adapter.',
        systemWorkflowIds: ['social.inbox.outbound.post-reply'],
      },
    ];

    const result = runCheckProductWorkflowBoundary({ exceptions });

    expect(result.violations).toHaveLength(0);
    expect(result.documentedDetections).toEqual([
      expect.objectContaining({
        detection: expect.objectContaining({
          ruleId: 'social-inbox-direct-platform-action',
        }),
      }),
    ]);
  });

  it('rejects workflow adapter exceptions without a replacement workflow id', () => {
    writeFixture(
      'apps/server/api/src/services/reply-bot/orchestrator.service.ts',
      `
        export class ReplyBotOrchestrator {
          async run(): Promise<void> {
            await this.botActionExecutorService.postReply({}, {}, 'hello');
          }
        }
      `,
    );

    const exceptions: ProductWorkflowBoundaryException[] = [
      {
        classification: 'workflow-adapter',
        file: 'apps/server/api/src/services/reply-bot/orchestrator.service.ts',
        id: 'reply-bot',
        issue: 1011,
        reason: 'Fixture workflow adapter.',
      },
    ];

    const result = runCheckProductWorkflowBoundary({ exceptions });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'incomplete-exception' }),
      ]),
    );
  });

  it('detects stale exception entries', () => {
    const exceptions: ProductWorkflowBoundaryException[] = [
      {
        classification: 'workflow-adapter',
        file: 'apps/server/api/src/services/reply-bot/missing.service.ts',
        id: 'missing',
        issue: 1011,
        reason: 'Fixture stale migration.',
        systemWorkflowIds: ['reply-bot.send-dm'],
      },
    ];

    const result = runCheckProductWorkflowBoundary({ exceptions });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'stale-exception' }),
      ]),
    );
  });
});

function writeFixture(relativePath: string, content: string): void {
  const filePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
