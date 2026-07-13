import type { Task } from '@services/management/tasks.service';
import { describe, expect, it } from 'vitest';
import {
  appendSearchParamsToHref,
  buildTaskLaunchHref,
  getBrandSwitchHref,
  getCurrentBrandScopedPath,
  isAssetGateSectionPath,
  normalizeProtectedPathname,
  pickOperatorTaskContextSearchParams,
} from './operator-shell';

describe('operator-shell helpers', () => {
  it('normalizes brand and org scoped protected routes', () => {
    expect(normalizeProtectedPathname('/acme/brand-x/studio/video')).toBe(
      '/studio/video',
    );
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
  });

  it('keeps the current brand-scoped path when switching brands', () => {
    expect(getCurrentBrandScopedPath('/acme/moonrise/workspace/overview')).toBe(
      '/workspace/overview',
    );
    expect(getCurrentBrandScopedPath('/acme/moonrise/studio/video')).toBe(
      '/studio/video',
    );
    expect(getCurrentBrandScopedPath('/acme/~/overview')).toBe(
      '/workspace/overview',
    );
  });

  it('gates the first-asset unlock sections (and their aliases) only', () => {
    // Gated sections + Workspace/Workflows aliases (Codex review: /tasks,
    // /orchestration must be gated too).
    for (const gated of [
      '/workspace',
      '/workspace/overview',
      '/overview',
      '/tasks',
      '/library',
      '/library/ingredients',
      '/analytics',
      '/analytics/overview',
      '/workflows',
      '/orchestration',
      '/posts/calendar',
    ]) {
      expect(isAssetGateSectionPath(gated)).toBe(true);
    }

    // Never gated: agent, settings, studio, research, publish base, messages,
    // admin — and a look-alike prefix must not false-match.
    for (const open of [
      '/agent',
      '/agent/new',
      '/settings',
      '/settings/organization',
      '/studio/image',
      '/research/discovery',
      '/posts',
      '/messages',
      '/admin',
      '/analytics-preview',
    ]) {
      expect(isAssetGateSectionPath(open)).toBe(false);
    }
  });

  it('keeps org-scoped app surfaces when switching brands', () => {
    expect(
      getBrandSwitchHref({
        nextBrandSlug: 'sunrise',
        nextOrgSlug: 'acme',
        pathname: '/acme/~/agent',
      }),
    ).toBe('/acme/~/agent');

    expect(
      getBrandSwitchHref({
        nextBrandSlug: 'sunrise',
        nextOrgSlug: 'acme',
        pathname: '/acme/~/agent/thread-1',
      }),
    ).toBe('/acme/~/agent/thread-1');
  });

  it('keeps brand-scoped app paths when switching brands', () => {
    expect(
      getBrandSwitchHref({
        nextBrandSlug: 'sunrise',
        nextOrgSlug: 'acme',
        pathname: '/acme/moonrise/studio/video',
      }),
    ).toBe('/acme/sunrise/studio/video');
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
    expect(appendSearchParamsToHref('/studio/image', params)).toBe(
      '/studio/image?taskId=task-1&taskTitle=Draft+launch+brief',
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
      '/compose/post?taskExecutionPath=caption_generation&taskId=task-42&taskOutputType=caption&taskSource=workspace&taskTitle=Draft+launch+hooks',
    );
    expect(buildTaskLaunchHref(task, 'edit')).toBe(
      '/editor?taskExecutionPath=caption_generation&taskId=task-42&taskOutputType=caption&taskSource=workspace&taskTitle=Draft+launch+hooks',
    );
  });

  it('routes newsletter workspace tasks to the newsletter composer', () => {
    const task = {
      executionPathUsed: 'caption_generation',
      id: 'task-99',
      outputType: 'newsletter',
      title: 'Draft weekly founder issue',
    } as Task;

    expect(buildTaskLaunchHref(task, 'auto')).toBe(
      '/compose/newsletter?taskExecutionPath=caption_generation&taskId=task-99&taskOutputType=newsletter&taskSource=workspace&taskTitle=Draft+weekly+founder+issue',
    );
  });
});
