import type { Task } from '@services/management/tasks.service';
import { describe, expect, it } from 'vitest';
import {
  appendSearchParamsToHref,
  buildTaskLaunchHref,
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
