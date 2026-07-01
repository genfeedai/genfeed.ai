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

  it('allows documented pending migrations with a replacement system workflow id', () => {
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
        classification: 'pending-system-workflow-migration',
        file: 'apps/server/api/src/services/reply-bot/orchestrator.service.ts',
        id: 'reply-bot',
        issue: 1011,
        reason: 'Fixture pending migration.',
        systemWorkflowIds: ['reply-dm-automation'],
      },
    ];

    const result = runCheckProductWorkflowBoundary({ exceptions });

    expect(result.violations).toHaveLength(0);
    expect(result.documentedDetections).toHaveLength(1);
  });

  it('rejects pending migration exceptions without a replacement workflow id', () => {
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
        classification: 'pending-system-workflow-migration',
        file: 'apps/server/api/src/services/reply-bot/orchestrator.service.ts',
        id: 'reply-bot',
        issue: 1011,
        reason: 'Fixture pending migration.',
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
        classification: 'pending-system-workflow-migration',
        file: 'apps/server/api/src/services/reply-bot/missing.service.ts',
        id: 'missing',
        issue: 1011,
        reason: 'Fixture stale migration.',
        systemWorkflowIds: ['reply-dm-automation'],
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
