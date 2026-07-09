import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { describe, expect, it } from 'vitest';

describe('WorkflowTemplates', () => {
  it('includes the X landscape avatar starter in the public template registry', () => {
    expect(WORKFLOW_TEMPLATES).toHaveProperty('avatar-ugc-x-landscape-heygen');
  });

  it('includes the real-estate workflow starters in the public template registry', () => {
    expect(WORKFLOW_TEMPLATES).toHaveProperty('virtual-staging-rescue');
    expect(WORKFLOW_TEMPLATES).toHaveProperty('floor-plan-interior-preview');
  });

  it('includes the on-demand launch-kit template with a review gate and no schedule', () => {
    const launchKit = WORKFLOW_TEMPLATES['launch-kit'];

    expect(launchKit?.name).toBe('Launch Kit');
    expect(launchKit?.category).toBe('launch');
    // On-demand, not a scheduled daily routine.
    expect(launchKit?.isScheduleEnabled).toBeFalsy();
    expect(launchKit?.schedule).toBeUndefined();
    expect(launchKit?.routine).toBeUndefined();

    const nodeTypes = (launchKit?.nodes ?? []).map((node) => node.type);
    expect(nodeTypes).toContain('reviewGate');
    expect(nodeTypes).toContain('ai-prompt-constructor');
    expect(nodeTypes).toContain('workflow-output');
  });

  it('includes the weekly brand AI content loop with source collection and post image attachment', () => {
    const template = WORKFLOW_TEMPLATES['weekly-brand-ai-content-loop'];

    expect(template?.name).toBe('Weekly Brand AI Content Loop');
    expect(template?.category).toBe('content');
    expect(template?.schedule).toBe('0 9 * * 1');

    const nodeTypes = new Set((template?.nodes ?? []).map((node) => node.type));
    expect(nodeTypes).toContain('source-corpus');
    expect(nodeTypes).toContain('ai-generate-newsletter');
    expect(nodeTypes).toContain('ai-generate-post');
    expect(nodeTypes).toContain('ai-generate-image');
    expect(nodeTypes).toContain('attach-post-ingredient');

    expect(template?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'image-ingredient',
          sourceHandle: 'id',
          target: 'attach-image-to-post',
          targetHandle: 'ingredientId',
        }),
        expect.objectContaining({
          source: 'x-post-draft',
          sourceHandle: 'id',
          target: 'attach-image-to-post',
          targetHandle: 'postId',
        }),
      ]),
    );
  });

  it('includes productized daily routine templates with review and tracking metadata', () => {
    const dailyTrendLoop = WORKFLOW_TEMPLATES['daily-trend-loop'];
    const releaseLoop = WORKFLOW_TEMPLATES['release-loop'];

    expect(dailyTrendLoop?.name).toBe('Daily Trend Loop');
    expect(releaseLoop?.name).toBe('Release Loop');

    for (const template of [dailyTrendLoop, releaseLoop]) {
      expect(template).toMatchObject({
        category: 'routines',
        isScheduleEnabled: true,
        routine: {
          cadence: 'daily',
          kind: 'productized-daily-routine',
          parentIssue: 224,
          reviewDefaults: {
            requireApproval: true,
            reviewState: 'pending_approval',
          },
          sourceIssue: 976,
          version: 1,
        },
        timezone: 'UTC',
      });
      expect(template?.inputVariables?.length).toBeGreaterThan(0);
      expect(template?.routine?.requiredSkills.length).toBeGreaterThan(0);
      expect(template?.routine?.recommendedSkills.length).toBeGreaterThan(0);
      expect(template?.routine?.trackingTasks.length).toBeGreaterThan(0);
      expect(template?.routine?.outputDestinations.length).toBeGreaterThan(0);
      expect(template?.schedule).toMatch(/\* \* \*/);
    }
  });
});
