import type { Task } from '@services/management/tasks.service';
import { describe, expect, it } from 'vitest';
import {
  getIsInboxChronologicalDescending,
  getWorkspaceInboxGroupKey,
} from './workspace-inbox-groups';

const NOW = new Date('2026-10-21T12:00:00');

function task(updatedAt: string | undefined): Task {
  return { createdAt: updatedAt, updatedAt } as Task;
}

describe('getWorkspaceInboxGroupKey', () => {
  it('buckets tasks into today, yesterday and earlier', () => {
    expect(getWorkspaceInboxGroupKey(task('2026-10-21T08:00:00'), NOW)).toBe(
      'today',
    );
    expect(getWorkspaceInboxGroupKey(task('2026-10-20T23:30:00'), NOW)).toBe(
      'yesterday',
    );
    expect(getWorkspaceInboxGroupKey(task('2026-10-18T09:00:00'), NOW)).toBe(
      'earlier',
    );
  });

  it('files a task without a timestamp under earlier', () => {
    expect(getWorkspaceInboxGroupKey(task(undefined), NOW)).toBe('earlier');
  });
});

describe('getIsInboxChronologicalDescending', () => {
  it('accepts a newest-first list', () => {
    expect(
      getIsInboxChronologicalDescending([
        task('2026-10-21T08:00:00'),
        task('2026-10-20T08:00:00'),
      ]),
    ).toBe(true);
  });

  it('rejects an oldest-first list and a list with a missing timestamp', () => {
    expect(
      getIsInboxChronologicalDescending([
        task('2026-10-20T08:00:00'),
        task('2026-10-21T08:00:00'),
      ]),
    ).toBe(false);
    expect(
      getIsInboxChronologicalDescending([
        task('2026-10-21T08:00:00'),
        task(undefined),
      ]),
    ).toBe(false);
  });
});
