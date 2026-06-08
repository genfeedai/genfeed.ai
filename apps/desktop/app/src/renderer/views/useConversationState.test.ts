import { describe, expect, it } from 'bun:test';
import type {
  IDesktopContentRunDraft,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';

import { buildPersistedContentRunDraft } from './useConversationState';

const workspace: IDesktopWorkspace = {
  createdAt: '2026-06-08T00:00:00.000Z',
  fileIndex: [],
  id: 'workspace-1',
  indexingState: 'idle',
  lastOpenedAt: '2026-06-08T00:00:00.000Z',
  linkedProjectId: 'project-2',
  localDraftCount: 1,
  name: 'Launch workspace',
  path: '/Users/example/Launch',
  pendingSyncCount: 0,
  syncPolicy: 'metadata-sync',
  updatedAt: '2026-06-08T00:00:00.000Z',
};

const selectedDraft: IDesktopContentRunDraft = {
  createdAt: '2026-06-07T21:00:00.000Z',
  id: 'draft-1',
  platform: 'twitter',
  prompt: 'Old launch hook',
  publishIntent: 'review',
  sourceType: 'prompt',
  status: 'draft',
  title: 'Old launch hook',
  type: 'hook',
  updatedAt: '2026-06-07T21:05:00.000Z',
  workspaceId: 'workspace-1',
};

describe('buildPersistedContentRunDraft', () => {
  it('keeps current composer platform, type, and intent when updating an existing draft', () => {
    const draft = buildPersistedContentRunDraft({
      contentType: 'article',
      input: 'Write the launch positioning as a founder article',
      now: '2026-06-08T00:15:00.000Z',
      platform: 'linkedin',
      publishIntent: 'draft',
      selectedDraft,
      workspace,
      workspaceId: 'workspace-1',
    });

    expect(draft).toMatchObject({
      id: 'draft-1',
      platform: 'linkedin',
      projectId: 'project-2',
      prompt: 'Write the launch positioning as a founder article',
      publishIntent: 'draft',
      title: 'Write the launch positioning as a founder article',
      type: 'article',
      updatedAt: '2026-06-08T00:15:00.000Z',
    });
  });

  it('lets send-time generation metadata override the persisted draft status', () => {
    const draft = buildPersistedContentRunDraft({
      contentType: 'thread',
      input: 'Turn the launch into a concise thread',
      now: '2026-06-08T00:20:00.000Z',
      overrides: {
        generatedContent: {
          content: 'Generated launch thread',
          id: 'generated-1',
          platform: 'twitter',
          type: 'thread',
        },
        status: 'generated',
      },
      platform: 'twitter',
      publishIntent: 'review',
      selectedDraft,
      workspace: null,
      workspaceId: 'workspace-1',
    });

    expect(draft.status).toBe('generated');
    expect(draft.generatedContent).toMatchObject({
      content: 'Generated launch thread',
      platform: 'twitter',
      type: 'thread',
    });
    expect(draft.projectId).toBeUndefined();
  });

  it('clears a stale draft project link when the workspace is currently unlinked', () => {
    const draft = buildPersistedContentRunDraft({
      contentType: 'caption',
      input: 'Write a launch caption',
      now: '2026-06-08T00:25:00.000Z',
      platform: 'instagram',
      publishIntent: 'review',
      selectedDraft: {
        ...selectedDraft,
        projectId: 'project-1',
      },
      workspace: {
        ...workspace,
        linkedProjectId: undefined,
      },
      workspaceId: 'workspace-1',
    });

    expect(draft.projectId).toBeUndefined();
  });
});
