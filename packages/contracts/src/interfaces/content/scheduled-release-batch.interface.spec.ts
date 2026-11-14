import { describe, expect, it } from 'vitest';
import { readScheduledReleaseBatch } from './scheduled-release-batch.interface';

describe('readScheduledReleaseBatch', () => {
  it.each([
    ['a batch', 'create_scheduled_release', { releases: [{}, {}] }, 2],
    ['an empty batch', 'create_scheduled_release', { releases: [] }, 0],
  ])('reads %s', (_label, toolName, args, count) => {
    expect(readScheduledReleaseBatch(toolName, args)).toHaveLength(count);
  });

  it.each([
    ['one release', 'create_scheduled_release', { release: { title: 'a' } }],
    ['another tool', 'create_post', { releases: [{}] }],
    [
      'releases that are not a list',
      'create_scheduled_release',
      { releases: {} },
    ],
    ['no arguments', 'create_scheduled_release', null],
    ['list arguments', 'create_scheduled_release', [{}]],
  ])('is null for %s', (_label, toolName, args) => {
    expect(readScheduledReleaseBatch(toolName, args)).toBeNull();
  });
});
