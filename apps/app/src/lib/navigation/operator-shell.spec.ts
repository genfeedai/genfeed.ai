import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import type { Task } from '@services/management/tasks.service';
import { describe, expect, it } from 'vitest';
import {
  appendSearchParamsToHref,
  buildTaskLaunchHref,
  getBrandSwitchHref,
  getCurrentBrandScopedPath,
  isAssetGateSectionPath,
  isFocusedOnboardingPath,
  normalizeProtectedPathname,
  pickOperatorTaskContextSearchParams,
  resolveAgentConversationRoute,
  resolveBrandSwitchSurfacePath,
  resolveOrganizationScopePath,
} from './operator-shell';

const threadId = testId('thread');

describe('operator-shell helpers', () => {
  it('normalizes brand and org scoped protected routes', () => {
    expect(normalizeProtectedPathname('/acme/brand-x/studio/storyboard')).toBe(
      '/studio/storyboard',
    );
    expect(
      normalizeProtectedPathname('/acme/brand-x/platforms/instagram'),
    ).toBe('/platforms/instagram');
    expect(normalizeProtectedPathname('/acme/~/settings')).toBe('/settings');
    expect(normalizeProtectedPathname('/acme/~/settings/organization')).toBe(
      '/settings/organization',
    );
    expect(normalizeProtectedPathname('/acme/~/agent/thread-1')).toBe(
      '/agent/thread-1',
    );
    expect(normalizeProtectedPathname('/acme/brand-x/agent/thread-1')).toBe(
      '/agent/thread-1',
    );
    expect(normalizeProtectedPathname(null)).toBe('');
    expect(normalizeProtectedPathname(undefined)).toBe('');
  });

  it('resolves which conversation surface a normalized agent path hosts', () => {
    expect(resolveAgentConversationRoute('/agent')).toEqual({
      isOnboarding: false,
      threadId: undefined,
    });
    expect(resolveAgentConversationRoute('/agent/new')).toEqual({
      isOnboarding: false,
      threadId: undefined,
    });
    expect(resolveAgentConversationRoute('/agent/thread-1')).toEqual({
      isOnboarding: false,
      threadId: 'thread-1',
    });
    expect(resolveAgentConversationRoute('/agent/onboarding')).toEqual({
      isOnboarding: true,
      threadId: undefined,
    });
    expect(resolveAgentConversationRoute('/agent/onboarding/thread-1')).toEqual(
      {
        isOnboarding: true,
        threadId: 'thread-1',
      },
    );
    expect(
      resolveAgentConversationRoute(
        normalizeProtectedPathname('/acme/~/agent/thread-1'),
      ),
    ).toEqual({ isOnboarding: false, threadId: 'thread-1' });
  });

  it('keeps malformed thread ids off the conversation surface', () => {
    // `/agent/undefined` from a stale link: the page redirects, the layout
    // must not fetch `/threads/undefined/*` in the meantime.
    expect(resolveAgentConversationRoute('/agent/undefined')).toEqual({
      isOnboarding: false,
      threadId: undefined,
    });
    expect(resolveAgentConversationRoute('/agent/onboarding/null')).toEqual({
      isOnboarding: true,
      threadId: undefined,
    });
  });

  it('leaves non-conversation agent routes to their own page', () => {
    expect(resolveAgentConversationRoute('/agent/journey')).toBeNull();
    expect(resolveAgentConversationRoute('/agent/thread-1/extra')).toBeNull();
    expect(resolveAgentConversationRoute('/workspace')).toBeNull();
    expect(resolveAgentConversationRoute('/agents')).toBeNull();
  });

  it('identifies focused onboarding from a normalized agent path', () => {
    expect(isFocusedOnboardingPath('/agent/onboarding')).toBe(true);
    expect(isFocusedOnboardingPath('/agent/onboarding/thread-1')).toBe(true);
    expect(isFocusedOnboardingPath('/agent/new')).toBe(false);
    expect(isFocusedOnboardingPath('/agent/thread-1')).toBe(false);
    expect(isFocusedOnboardingPath('/agent/journey')).toBe(false);
    expect(
      isFocusedOnboardingPath(
        normalizeProtectedPathname('/acme/~/agent/onboarding'),
      ),
    ).toBe(true);
  });

  it('never rewrites global admin / product roots as org/brand modules', () => {
    // Regression: segment[2] === "analytics" used to strip `/admin/overview`
    // and force brand Analytics shell chrome on the platform admin analytics.
    expect(normalizeProtectedPathname('/admin/overview/analytics/all')).toBe(
      '/admin/overview/analytics/all',
    );
    expect(
      normalizeProtectedPathname('/admin/overview/analytics/business'),
    ).toBe('/admin/overview/analytics/business');
    expect(normalizeProtectedPathname('/admin/overview/dashboard')).toBe(
      '/admin/overview/dashboard',
    );
    expect(normalizeProtectedPathname('/admin/configuration/elements')).toBe(
      '/admin/configuration/elements',
    );
    expect(normalizeProtectedPathname('/admin/automation/bots')).toBe(
      '/admin/automation/bots',
    );
    expect(normalizeProtectedPathname('/analytics/overview')).toBe(
      '/analytics/overview',
    );
    expect(normalizeProtectedPathname('/studio/storyboard')).toBe(
      '/studio/storyboard',
    );
  });

  it('keeps the current brand-scoped path when switching brands', () => {
    expect(getCurrentBrandScopedPath('/acme/moonrise/workspace')).toBe(
      '/workspace',
    );
    expect(getCurrentBrandScopedPath('/acme/moonrise/studio/storyboard')).toBe(
      '/studio/storyboard',
    );
    expect(getCurrentBrandScopedPath('/acme/~/workspace/overview')).toBe(
      '/workspace/overview',
    );
    expect(getCurrentBrandScopedPath('/acme/~/agent/new')).toBe('/agent/new');
    expect(getCurrentBrandScopedPath('/acme/moonrise/agent/thread-1')).toBe(
      '/agent/thread-1',
    );
  });

  it('drops a selected conversation when resolving a brand-switch surface', () => {
    expect(resolveBrandSwitchSurfacePath(`/agent/${threadId}`)).toBe(
      '/agent/new',
    );
    expect(resolveBrandSwitchSurfacePath('/agent/onboarding/thread-1')).toBe(
      '/agent/new',
    );
    expect(resolveBrandSwitchSurfacePath('/agent/new')).toBe('/agent/new');
    expect(resolveBrandSwitchSurfacePath('/studio/storyboard')).toBe(
      '/studio/storyboard',
    );
  });

  it('maps brand-only settings to the org brands hub when leaving brand scope', () => {
    expect(resolveOrganizationScopePath('/settings/publishing')).toBe(
      '/settings/brands',
    );
    expect(resolveOrganizationScopePath('/settings/voice')).toBe(
      '/settings/brands',
    );
    expect(resolveOrganizationScopePath('/settings/interview')).toBe(
      '/settings/brands',
    );
    expect(resolveOrganizationScopePath('/settings/harness')).toBe(
      '/settings/brands',
    );
    expect(resolveOrganizationScopePath('/settings/agent-defaults')).toBe(
      '/settings/brands',
    );
    expect(resolveOrganizationScopePath('/settings/skills')).toBe(
      '/settings/brands',
    );
    expect(resolveOrganizationScopePath('/settings/social')).toBe(
      '/settings/brands',
    );
    expect(resolveOrganizationScopePath('/settings/kit')).toBe(
      '/settings/brands',
    );
    expect(resolveOrganizationScopePath('/settings/characters')).toBe(
      '/settings/brands',
    );
    // Shared surfaces keep their path under org scope.
    expect(resolveOrganizationScopePath('/settings')).toBe('/settings');
    expect(resolveOrganizationScopePath('/settings/brands')).toBe(
      '/settings/brands',
    );
    expect(resolveOrganizationScopePath(`/agent/${threadId}`)).toBe(
      '/agent/new',
    );
    expect(resolveOrganizationScopePath('/agent')).toBe('/agent/new');
    expect(resolveOrganizationScopePath('/agent/onboarding/thread-1')).toBe(
      '/agent/new',
    );
    expect(resolveOrganizationScopePath('/agent/new')).toBe('/agent/new');
    expect(resolveOrganizationScopePath('/studio/storyboard')).toBe(
      '/studio/storyboard',
    );
  });

  it('gates the first-asset unlock sections (and their subpaths) only', () => {
    // Every gated section prefix, plus a nested path under one of them.
    for (const gated of [
      '/workspace',
      '/workspace/tasks',
      '/overview',
      '/library',
      '/analytics',
      '/automation',
      '/automation/workflows',
      '/publishing/calendar',
    ]) {
      expect(isAssetGateSectionPath(gated)).toBe(true);
    }

    // Never gated: Agent, Settings, Studio, Discovery, Publishing base, Messages,
    // admin — and a look-alike prefix must not false-match.
    for (const open of [
      '/agent',
      '/agent/new',
      '/settings',
      '/settings/organization',
      '/studio/storyboard',
      '/discovery/overview',
      '/publishing',
      '/messages',
      '/admin',
      '/analytics-preview',
    ]) {
      expect(isAssetGateSectionPath(open)).toBe(false);
    }
  });

  it('enters the selected brand and drops a selected conversation', () => {
    expect(
      getBrandSwitchHref({
        nextBrandSlug: 'sunrise',
        nextOrgSlug: 'acme',
        pathname: '/acme/~/agent',
      }),
    ).toBe('/acme/sunrise/agent/new');

    expect(
      getBrandSwitchHref({
        nextBrandSlug: 'sunrise',
        nextOrgSlug: 'acme',
        pathname: `/acme/werwer/agent/${threadId}`,
      }),
    ).toBe('/acme/sunrise/agent/new');

    expect(
      getBrandSwitchHref({
        nextBrandSlug: 'sunrise',
        nextOrgSlug: 'acme',
        pathname: '/acme/moonrise/agent/new',
      }),
    ).toBe('/acme/sunrise/agent/new');
  });

  it('keeps brand-scoped app paths when switching brands', () => {
    expect(
      getBrandSwitchHref({
        nextBrandSlug: 'sunrise',
        nextOrgSlug: 'acme',
        pathname: '/acme/moonrise/studio/storyboard',
      }),
    ).toBe('/acme/sunrise/studio/storyboard');
  });

  it('picks and appends only task context params', () => {
    const params = pickOperatorTaskContextSearchParams(
      new URLSearchParams([
        ['taskId', 'task-1'],
        ['taskTitle', 'Draft launch brief'],
        ['foo', 'bar'],
      ]),
    );

    expect(params.toString()).toBe(
      'taskId=task-1&taskTitle=Draft+launch+brief',
    );
    expect(appendSearchParamsToHref('/studio/storyboard', params)).toBe(
      '/studio/storyboard?taskId=task-1&taskTitle=Draft+launch+brief',
    );
  });

  it('builds task launch hrefs with task context metadata', () => {
    const task = {
      executionPathUsed: 'caption_generation',
      id: 'task-42',
      outputType: 'caption',
      title: 'Draft launch hooks',
    } as Task;

    expect(buildTaskLaunchHref(task, 'auto')).toBe(
      '/agent/new?taskExecutionPath=caption_generation&taskId=task-42&taskOutputType=caption&taskSource=workspace&taskTitle=Draft+launch+hooks',
    );
    expect(buildTaskLaunchHref(task, 'edit')).toBe(
      '/studio/edit?taskExecutionPath=caption_generation&taskId=task-42&taskOutputType=caption&taskSource=workspace&taskTitle=Draft+launch+hooks',
    );
  });

  it('routes edit tasks to Agent when Studio is unavailable', () => {
    const task = {
      executionPathUsed: 'video_generation',
      id: 'task-101',
      outputType: 'video',
      title: 'Trim launch teaser',
    } as Task;

    expect(buildTaskLaunchHref(task, 'edit', { studio: false })).toBe(
      '/agent/new?taskExecutionPath=video_generation&taskId=task-101&taskOutputType=video&taskSource=workspace&taskTitle=Trim+launch+teaser',
    );
  });

  it('routes newsletter workspace tasks to the Agent', () => {
    const task = {
      executionPathUsed: 'caption_generation',
      id: 'task-99',
      outputType: 'newsletter',
      title: 'Draft weekly founder issue',
    } as Task;

    expect(buildTaskLaunchHref(task, 'auto')).toBe(
      '/agent/new?taskExecutionPath=caption_generation&taskId=task-99&taskOutputType=newsletter&taskSource=workspace&taskTitle=Draft+weekly+founder+issue',
    );
  });

  it('routes every write-mode task to the Agent regardless of output type', () => {
    for (const outputType of ['article', 'caption', 'newsletter', 'post']) {
      const task = {
        executionPathUsed: 'caption_generation',
        id: 'task-write',
        outputType,
        title: 'Draft it',
      } as Task;

      expect(buildTaskLaunchHref(task, 'write')).toBe(
        `/agent/new?taskExecutionPath=caption_generation&taskId=task-write&taskOutputType=${outputType}&taskSource=workspace&taskTitle=Draft+it`,
      );
    }
  });

  it('routes generate-mode launches to the Agent unconditionally', () => {
    const task = {
      executionPathUsed: 'video_generation',
      id: 'task-100',
      outputType: 'video',
      title: 'Generate launch teaser',
    } as Task;

    expect(buildTaskLaunchHref(task, 'generate')).toBe(
      '/agent/new?taskExecutionPath=video_generation&taskId=task-100&taskOutputType=video&taskSource=workspace&taskTitle=Generate+launch+teaser',
    );
  });

  it('routes auto-mode media generation tasks to the Agent', () => {
    // Studio no longer has standalone image/video tabs — the Agent owns one-offs.
    const imageTask = {
      executionPathUsed: 'image_generation',
      id: 'task-101',
      outputType: 'image',
      title: 'Generate hero still',
    } as Task;

    expect(buildTaskLaunchHref(imageTask, 'auto')).toBe(
      '/agent/new?taskExecutionPath=image_generation&taskId=task-101&taskOutputType=image&taskSource=workspace&taskTitle=Generate+hero+still',
    );

    const videoTask = {
      executionPathUsed: 'video_generation',
      id: 'task-102',
      outputType: 'video',
      title: 'Generate teaser cut',
    } as Task;

    expect(buildTaskLaunchHref(videoTask, 'auto')).toBe(
      '/agent/new?taskExecutionPath=video_generation&taskId=task-102&taskOutputType=video&taskSource=workspace&taskTitle=Generate+teaser+cut',
    );
  });
});
