import { describe, expect, it } from 'bun:test';
import { DESKTOP_IPC_CHANNELS } from '@genfeedai/desktop-contracts';
import {
  buildWorkspaceAssetsDir,
  buildWorkspaceDraftsPath,
  buildWorkspaceThreadsPath,
  resolvePathInsideRoot,
} from '@genfeedai/desktop-core';

describe('desktop shared packages', () => {
  it('exposes stable desktop IPC channel names', () => {
    expect(DESKTOP_IPC_CHANNELS.authLogin).toBe('desktop:auth:login');
    expect(DESKTOP_IPC_CHANNELS.appOpenExternalPath).toBe(
      'desktop:app:openExternalPath',
    );
    expect(DESKTOP_IPC_CHANNELS.workspaceOpen).toBe('desktop:workspace:open');
    expect(DESKTOP_IPC_CHANNELS.draftsSave).toBe('desktop:drafts:save');
  });

  it('resolves paths inside a workspace root', () => {
    expect(resolvePathInsideRoot('/tmp/workspace', '.genfeed/notes.md')).toBe(
      '/tmp/workspace/.genfeed/notes.md',
    );
  });

  it('rejects escaping the workspace root', () => {
    expect(() =>
      resolvePathInsideRoot('/tmp/workspace', '../outside.txt'),
    ).toThrow('Path escapes workspace root');
  });

  it('builds the workspace assets directory in a shared utility', () => {
    expect(buildWorkspaceAssetsDir('/tmp/workspace')).toBe(
      '/tmp/workspace/.genfeed/assets',
    );
  });

  it('builds the workspace drafts and threads paths in shared utilities', () => {
    expect(buildWorkspaceDraftsPath('/tmp/workspace')).toBe(
      '/tmp/workspace/.genfeed/content-runs.json',
    );
    expect(buildWorkspaceThreadsPath('/tmp/workspace')).toBe(
      '/tmp/workspace/.genfeed/threads.json',
    );
  });
});
