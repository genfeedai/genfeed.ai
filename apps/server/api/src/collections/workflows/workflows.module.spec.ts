import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'workflows.module.ts'),
  'utf8',
);

describe('WorkflowsModule optional executor imports', () => {
  it('imports fat PostsModule so AnalyticsSyncWorkflowService is constructible', () => {
    expect(source).toContain("from '@api/collections/posts/posts.module'");
    expect(source).toContain('PostsModule');
    expect(source).not.toContain('PostsCoreModule');
  });

  it('imports fat VideosModule so VideoMusicOrchestrationService is constructible', () => {
    expect(source).toContain("from '@api/collections/videos/videos.module'");
    expect(source).toContain('VideosModule');
    expect(source).not.toContain('VideosCoreModule');
  });

  it('#3407: registers OutreachCampaignDispatchWorkflowService as a provider so the scheduler executor is DI-constructible', () => {
    expect(source).toContain(
      "from '@api/collections/workflows/services/outreach-campaign-dispatch-workflow.service'",
    );
    expect(source).toMatch(
      /providers:\s*\[[\s\S]*OutreachCampaignDispatchWorkflowService[\s\S]*\]/,
    );
  });

  it('#3537: imports PaidCreativeResearchModule and registers PaidCreativeResearchWorkflowService as a provider so it is DI-constructible rather than resolving to undefined at runtime', () => {
    expect(source).toContain(
      "from '@api/services/paid-creative-research/paid-creative-research.module'",
    );
    expect(source).toMatch(
      /imports:\s*\[[\s\S]*PaidCreativeResearchModule[\s\S]*\]/,
    );
    expect(source).toMatch(
      /providers:\s*\[[\s\S]*PaidCreativeResearchWorkflowService[\s\S]*\]/,
    );
  });
});
