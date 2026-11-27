import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import type {
  IDesktopWorkspace,
  IDesktopWorkspaceContext,
  IDesktopWorkspaceCreateProjectRequest,
  IDesktopWorkspaceEntry,
  IDesktopWorkspaceState,
} from '@genfeedai/contracts/desktop';
import { resolveRealPathInsideRoot } from '@genfeedai/desktop-core';
import type { DesktopKeyValueStore } from './store.service';

const WORKSPACES_STORAGE_KEY = 'desktop.workspaces';
const MAX_PROJECT_NAME_LENGTH = 80;
const MAX_LISTED_ENTRIES = 5_000;
const UNSAFE_FOLDER_CHARACTERS = /[^\p{L}\p{N}._ -]+/gu;
const DOT_RUNS = /\.{2,}/g;
const WHITESPACE_RUNS = /\s+/g;
const LEADING_DOTS = /^\.+/;

interface StoredWorkspaces {
  activeByServer: Record<string, string>;
  projectsHome: string | null;
  workspaces: IDesktopWorkspace[];
}

export interface DesktopWorkspaceServiceOptions {
  /** Stable id of the selected server; a workspace belongs to one server. */
  getServerId: () => string;
  /** Home of the machine user; `~/.genfeedai/projects` is the default projects home. */
  homeDirectory?: string;
  now?: () => Date;
}

class DesktopWorkspaceError extends Error {}

/** Validates the renderer's organization and brand ids before they are stored. */
export function parseDesktopWorkspaceContext(
  value: unknown,
): IDesktopWorkspaceContext {
  if (!isRecord(value)) {
    throw new DesktopWorkspaceError('Invalid workspace context.');
  }

  const id = (key: 'brandId' | 'organizationId'): string | null => {
    const candidate = value[key];
    if (candidate === undefined || candidate === null) {
      return null;
    }
    if (typeof candidate !== 'string' || candidate.length > 128) {
      throw new DesktopWorkspaceError('Invalid workspace context.');
    }
    return candidate;
  };

  return { brandId: id('brandId'), organizationId: id('organizationId') };
}

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

function parseWorkspace(value: unknown): IDesktopWorkspace | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.path !== 'string' ||
    typeof value.serverId !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.lastOpenedAt !== 'string' ||
    !isNullableString(value.organizationId ?? null) ||
    !isNullableString(value.brandId ?? null)
  ) {
    return null;
  }

  return {
    brandId: (value.brandId as string | null | undefined) ?? null,
    createdAt: value.createdAt,
    id: value.id,
    lastOpenedAt: value.lastOpenedAt,
    name: value.name,
    organizationId: (value.organizationId as string | null | undefined) ?? null,
    path: value.path,
    serverId: value.serverId,
  };
}

function parseStored(raw: string | null): StoredWorkspaces {
  const empty: StoredWorkspaces = {
    activeByServer: {},
    projectsHome: null,
    workspaces: [],
  };
  if (!raw) {
    return empty;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return empty;
    }

    return {
      activeByServer: isRecord(parsed.activeByServer)
        ? Object.fromEntries(
            Object.entries(parsed.activeByServer).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === 'string',
            ),
          )
        : {},
      projectsHome:
        typeof parsed.projectsHome === 'string' ? parsed.projectsHome : null,
      workspaces: Array.isArray(parsed.workspaces)
        ? parsed.workspaces.flatMap((entry) => {
            const workspace = parseWorkspace(entry);
            return workspace ? [workspace] : [];
          })
        : [],
    };
  } catch {
    return empty;
  }
}

function isDirectory(directory: string): boolean {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Folders Desktop works in while signed in to Genfeed Cloud or a self-hosted
 * server. The records are small and live in the Electron process's state file,
 * not in the cloud: a folder path means nothing on another machine. Each record
 * pairs the folder with an organization and brand, so later work knows which
 * Library it belongs to.
 */
export class DesktopWorkspaceService {
  private readonly homeDirectory: string;
  private readonly now: () => Date;

  constructor(
    private readonly store: DesktopKeyValueStore,
    private readonly options: DesktopWorkspaceServiceOptions,
  ) {
    this.homeDirectory = options.homeDirectory ?? os.homedir();
    this.now = options.now ?? (() => new Date());
  }

  private read(): StoredWorkspaces {
    return parseStored(this.store.getValueSync(WORKSPACES_STORAGE_KEY));
  }

  private write(stored: StoredWorkspaces): void {
    this.store.setValueSync(WORKSPACES_STORAGE_KEY, JSON.stringify(stored));
  }

  getDefaultProjectsHome(): string {
    return path.join(this.homeDirectory, '.genfeedai', 'projects');
  }

  getState(): IDesktopWorkspaceState {
    const stored = this.read();
    const serverId = this.options.getServerId();
    const workspaces = stored.workspaces
      .filter((workspace) => workspace.serverId === serverId)
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
    const activeId = stored.activeByServer[serverId] ?? null;
    const active = workspaces.find((workspace) => workspace.id === activeId);

    return {
      // A folder that was deleted or sits on an unplugged drive is not active.
      activeWorkspaceId: active && isDirectory(active.path) ? active.id : null,
      projectsHome: stored.projectsHome ?? this.getDefaultProjectsHome(),
      workspaces,
    };
  }

  /** Opens (or re-opens) a folder the user picked and makes it the active workspace. */
  openFolder(
    folderPath: string,
    context: IDesktopWorkspaceContext,
  ): IDesktopWorkspace {
    if (!path.isAbsolute(folderPath) || !isDirectory(folderPath)) {
      throw new DesktopWorkspaceError('Pick an existing folder.');
    }

    const realPath = fs.realpathSync(folderPath);
    const stored = this.read();
    const serverId = this.options.getServerId();
    const timestamp = this.now().toISOString();
    const existing = stored.workspaces.find(
      (workspace) =>
        workspace.serverId === serverId && workspace.path === realPath,
    );

    const workspace: IDesktopWorkspace = existing
      ? { ...existing, ...context, lastOpenedAt: timestamp }
      : {
          ...context,
          createdAt: timestamp,
          id: randomUUID(),
          lastOpenedAt: timestamp,
          name: path.basename(realPath) || realPath,
          path: realPath,
          serverId,
        };

    this.write({
      ...stored,
      activeByServer: { ...stored.activeByServer, [serverId]: workspace.id },
      workspaces: existing
        ? stored.workspaces.map((entry) =>
            entry.id === workspace.id ? workspace : entry,
          )
        : [...stored.workspaces, workspace],
    });

    return workspace;
  }

  /** Creates `<projects home>/<name>` and opens it. Never reuses an existing folder. */
  createProject(
    request: IDesktopWorkspaceCreateProjectRequest,
  ): IDesktopWorkspace {
    const folderName = request.name
      .replace(UNSAFE_FOLDER_CHARACTERS, ' ')
      .replace(DOT_RUNS, ' ')
      .replace(WHITESPACE_RUNS, ' ')
      .trim()
      .replace(LEADING_DOTS, '')
      .slice(0, MAX_PROJECT_NAME_LENGTH)
      .trim();

    if (!folderName) {
      throw new DesktopWorkspaceError('Give the project a name.');
    }

    const home = this.getState().projectsHome;
    fs.mkdirSync(home, { recursive: true });

    for (let attempt = 1; attempt < 1_000; attempt += 1) {
      const candidate = path.join(
        home,
        attempt === 1 ? folderName : `${folderName} ${String(attempt)}`,
      );
      try {
        fs.mkdirSync(candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          continue;
        }
        throw error;
      }

      return this.openFolder(candidate, {
        brandId: request.brandId,
        organizationId: request.organizationId,
      });
    }

    throw new DesktopWorkspaceError('Could not find a free folder name.');
  }

  setActive(workspaceId: string | null): IDesktopWorkspaceState {
    const stored = this.read();
    const serverId = this.options.getServerId();
    const activeByServer = { ...stored.activeByServer };

    if (workspaceId === null) {
      delete activeByServer[serverId];
    } else {
      const workspace = this.requireWorkspace(workspaceId);
      if (!isDirectory(workspace.path)) {
        throw new DesktopWorkspaceError('This folder no longer exists.');
      }
      activeByServer[serverId] = workspaceId;
      stored.workspaces = stored.workspaces.map((entry) =>
        entry.id === workspaceId
          ? { ...entry, lastOpenedAt: this.now().toISOString() }
          : entry,
      );
    }

    this.write({ ...stored, activeByServer });
    return this.getState();
  }

  /** Forgets the workspace. Nothing on disk is touched. */
  remove(workspaceId: string): void {
    this.requireWorkspace(workspaceId);
    const stored = this.read();
    this.write({
      ...stored,
      activeByServer: Object.fromEntries(
        Object.entries(stored.activeByServer).filter(
          ([, id]) => id !== workspaceId,
        ),
      ),
      workspaces: stored.workspaces.filter(({ id }) => id !== workspaceId),
    });
  }

  linkContext(
    workspaceId: string,
    context: IDesktopWorkspaceContext,
  ): IDesktopWorkspace {
    const workspace = { ...this.requireWorkspace(workspaceId), ...context };
    const stored = this.read();
    this.write({
      ...stored,
      workspaces: stored.workspaces.map((entry) =>
        entry.id === workspaceId ? workspace : entry,
      ),
    });
    return workspace;
  }

  setProjectsHome(folderPath: string): IDesktopWorkspaceState {
    if (!path.isAbsolute(folderPath) || !isDirectory(folderPath)) {
      throw new DesktopWorkspaceError('Pick an existing folder.');
    }

    this.write({ ...this.read(), projectsHome: fs.realpathSync(folderPath) });
    return this.getState();
  }

  getWorkspace(workspaceId: string): IDesktopWorkspace {
    return this.requireWorkspace(workspaceId);
  }

  /**
   * Absolute path of `relativePath` inside the workspace folder. Refuses `..`,
   * absolute paths and symlinks that lead out of the folder. Every read or
   * write a later feature does in a workspace goes through this.
   */
  resolvePath(workspaceId: string, relativePath = '.'): string {
    const workspace = this.requireWorkspace(workspaceId);
    if (!isDirectory(workspace.path)) {
      throw new DesktopWorkspaceError('This folder no longer exists.');
    }
    return resolveRealPathInsideRoot(workspace.path, relativePath);
  }

  listDirectory(
    workspaceId: string,
    relativePath = '.',
  ): IDesktopWorkspaceEntry[] {
    const directory = this.resolvePath(workspaceId, relativePath);
    const root = fs.realpathSync(this.requireWorkspace(workspaceId).path);

    return fs
      .readdirSync(directory, { withFileTypes: true })
      .slice(0, MAX_LISTED_ENTRIES)
      .flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        try {
          // `stat` follows links, and an entry that points out of the folder is
          // left out of the listing instead of leaking where it leads.
          resolveRealPathInsideRoot(root, path.relative(root, entryPath));
          const stats = fs.statSync(entryPath);
          return [
            {
              isDirectory: stats.isDirectory(),
              name: entry.name,
              path: path.relative(root, entryPath).split(path.sep).join('/'),
              size: stats.isDirectory() ? 0 : stats.size,
            },
          ];
        } catch {
          return [];
        }
      })
      .sort(
        (a, b) =>
          Number(b.isDirectory) - Number(a.isDirectory) ||
          a.name.localeCompare(b.name),
      );
  }

  private requireWorkspace(workspaceId: string): IDesktopWorkspace {
    const serverId = this.options.getServerId();
    const workspace = this.read().workspaces.find(
      (entry) => entry.id === workspaceId && entry.serverId === serverId,
    );
    if (!workspace) {
      throw new DesktopWorkspaceError('Unknown workspace.');
    }
    return workspace;
  }
}
