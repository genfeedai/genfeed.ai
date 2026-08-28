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
      'apps/server/server/src/collections/articles/articles.service.ts',
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
      'apps/server/server/src/collections/social-inbox/services/social-inbox.service.ts',
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
          file: 'apps/server/server/src/collections/social-inbox/services/social-inbox.service.ts',
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
