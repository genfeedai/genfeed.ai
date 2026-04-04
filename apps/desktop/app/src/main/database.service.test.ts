import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SyncJobRow, WorkspaceRow } from './database.service';
import {
  electronMockState,
  resetElectronMockState,
} from './test-support/electron.mock';

type RecentItemRow = {
  id: string;
  kind: string;
  label: string;
  openedAt: string;
  value: string;
};

const fakeDbState = {
  constructedPath: '',
  execStatements: [] as string[],
  kv: new Map<string, string>(),
  pragmas: [] as string[],
  recentItems: new Map<string, RecentItemRow>(),
  syncJobs: new Map<string, SyncJobRow>(),
  workspaces: new Map<string, WorkspaceRow>(),
};

const sortByOpenedAtDesc = (items: RecentItemRow[]): RecentItemRow[] =>
  [...items].sort((left, right) => right.openedAt.localeCompare(left.openedAt));

const sortByUpdatedAtDesc = (items: SyncJobRow[]): SyncJobRow[] =>
  [...items].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );

const sortByLastOpenedAtDesc = (items: WorkspaceRow[]): WorkspaceRow[] =>
  [...items].sort((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt),
  );

const normalizeSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

class FakeDatabase {
  constructor(filePath: string) {
    fakeDbState.constructedPath = filePath;
  }

  pragma(value: string): void {
    fakeDbState.pragmas.push(value);
  }

  exec(sql: string): void {
    fakeDbState.execStatements.push(sql);
  }

  prepare(sql: string): {
    all: (value?: string) => unknown[];
    get: (value: string) => unknown;
    run: (value: unknown) => void;
  } {
    const statement = normalizeSql(sql);

    return {
      all: (value?: string) => {
        if (statement.includes('FROM workspace_registry')) {
          return sortByLastOpenedAtDesc(
            Array.from(fakeDbState.workspaces.values()),
          );
        }

        if (
          statement.includes('FROM sync_jobs') &&
          statement.includes('WHERE workspaceId = ?')
        ) {
          return sortByUpdatedAtDesc(
            Array.from(fakeDbState.syncJobs.values()).filter(
              (job) => job.workspaceId === value,
            ),
          );
        }

        if (statement.includes('FROM sync_jobs')) {
          return sortByUpdatedAtDesc(Array.from(fakeDbState.syncJobs.values()));
        }

        if (statement.includes('FROM recent_items')) {
          return sortByOpenedAtDesc(
            Array.from(fakeDbState.recentItems.values()),
          ).slice(0, 12);
        }

        throw new Error(`Unsupported all() statement: ${statement}`);
      },
      get: (value: string) => {
        if (statement.includes('SELECT value FROM kv_store')) {
          const storedValue = fakeDbState.kv.get(value);
          return storedValue ? { value: storedValue } : undefined;
        }

        if (statement.includes('FROM workspace_registry WHERE id = ?')) {
          return fakeDbState.workspaces.get(value);
        }

        throw new Error(`Unsupported get() statement: ${statement}`);
      },
      run: (value: unknown) => {
        if (statement.includes('INSERT INTO kv_store')) {
          const row = value as { key: string; value: string };
          fakeDbState.kv.set(row.key, row.value);
          return;
        }

        if (statement.includes('DELETE FROM kv_store')) {
          fakeDbState.kv.delete(value as string);
          return;
        }

        if (statement.includes('INSERT INTO workspace_registry')) {
          const row = value as WorkspaceRow;
          fakeDbState.workspaces.set(row.id, row);
          return;
        }

        if (statement.includes('INSERT INTO sync_jobs')) {
          const row = value as SyncJobRow;
          fakeDbState.syncJobs.set(row.id, row);
          return;
        }

        if (statement.includes('INSERT INTO recent_items')) {
          const row = value as RecentItemRow;
          fakeDbState.recentItems.set(row.id, row);
          return;
        }

        throw new Error(`Unsupported run() statement: ${statement}`);
      },
    };
  }
}

mock.module('better-sqlite3', () => ({
  default: FakeDatabase,
}));

const { DesktopDatabaseService } = await import('./database.service');

describe('DesktopDatabaseService', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-desktop-database-'),
    );
    resetElectronMockState();
    electronMockState.app.userDataPath = userDataDir;
    fakeDbState.constructedPath = '';
    fakeDbState.execStatements = [];
    fakeDbState.kv.clear();
    fakeDbState.pragmas = [];
    fakeDbState.recentItems.clear();
    fakeDbState.syncJobs.clear();
    fakeDbState.workspaces.clear();
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { force: true, recursive: true });
  });

  it('initializes the sqlite store in Electron userData and persists kv values', () => {
    const service = new DesktopDatabaseService();

    expect(fs.existsSync(userDataDir)).toBe(true);
    expect(fakeDbState.constructedPath).toBe(
      path.join(userDataDir, 'genfeed-desktop.sqlite'),
    );
    expect(fakeDbState.pragmas).toContain('journal_mode = WAL');
    expect(fakeDbState.execStatements[0]).toContain(
      'CREATE TABLE IF NOT EXISTS kv_store',
    );

    service.setValue('desktop.session', 'token-123');
    expect(service.getValue('desktop.session')).toBe('token-123');

    service.deleteValue('desktop.session');
    expect(service.getValue('desktop.session')).toBeNull();
  });

  it('round-trips workspace, sync job, and recents records', () => {
    const service = new DesktopDatabaseService();
    const now = '2026-04-01T10:00:00.000Z';

    service.upsertWorkspace({
      createdAt: now,
      fileIndex: '[]',
      id: 'workspace-1',
      indexingState: 'idle',
      lastOpenedAt: now,
      linkedProjectId: null,
      localDraftCount: 2,
      name: 'Desktop Workspace',
      path: '/tmp/workspace',
      pendingSyncCount: 1,
      updatedAt: now,
    });

    service.upsertSyncJob({
      createdAt: now,
      error: null,
      id: 'job-1',
      payload: '{"draftId":"draft-1"}',
      status: 'pending',
      type: 'publish',
      updatedAt: now,
      workspaceId: 'workspace-1',
    });

    service.upsertRecentItem({
      id: 'workspace-1',
      kind: 'workspace',
      label: 'Desktop Workspace',
      openedAt: now,
      value: '/tmp/workspace',
    });

    expect(service.getWorkspaceById('workspace-1')?.name).toBe(
      'Desktop Workspace',
    );
    expect(service.listWorkspaces()).toHaveLength(1);
    expect(service.listSyncJobs('workspace-1')[0]?.type).toBe('publish');
    expect(service.listRecentItems()[0]?.value).toBe('/tmp/workspace');
  });
});
