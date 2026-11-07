import { describe, expect, it } from 'vitest';
import { hasWorkspaceSkeletonSidebar } from './workspace-frame-skeleton.utils';

describe('hasWorkspaceSkeletonSidebar', () => {
  it.each([
    ['/acme/main/workspace/overview', true],
    ['/acme/main/library/images', true],
    ['/acme/~/settings/general', true],
    ['/acme/main/agent', false],
    ['/acme/main/agent/thread_123', false],
    ['/acme/main/editor/video_1', false],
    ['/acme/main/automation/workflows/new', false],
    ['/acme/main/automation/workflows/wf-123', false],
    ['/acme/main/playground', false],
    ['/acme/main/storyboard/board_1', false],
    ['/acme/~/apps', false],
    ['/acme/~/apps/clipper', false],
  ])('draws the menu column for %s: %s', (pathname, expected) => {
    expect(hasWorkspaceSkeletonSidebar(pathname)).toBe(expected);
  });
});
