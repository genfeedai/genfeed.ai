import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DesktopStoreService } from './store.service';
import {
  DesktopWorkspaceService,
  parseDesktopWorkspaceContext,
} from './workspace.service';

const context = { brandId: 'brand-1', organizationId: 'org-1' };

describe('DesktopWorkspaceService', () => {
  let base: string;
  let home: string;
  let statePath: string;
  let serverId: string;
  let clock: number;

  const createService = (): DesktopWorkspaceService =>
    new DesktopWorkspaceService(new DesktopStoreService(statePath), {
      getServerId: () => serverId,
      homeDirectory: home,
      now: () => {
        clock += 1;
        return new Date(Date.UTC(2026, 10, 27, 10, 0, clock));
      },
    });

  const makeFolder = (name: string): string => {
    const folder = path.join(base, name);
    fs.mkdirSync(folder, { recursive: true });
    return fs.realpathSync(folder);
  };

  beforeEach(() => {
    base = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-desktop-workspace-')),
    );
    home = path.join(base, 'home');
    fs.mkdirSync(home);
    statePath = path.join(base, 'state', 'desktop-state.json');
    serverId = 'cloud';
    clock = 0;
  });

  afterEach(() => {
    fs.rmSync(base, { force: true, recursive: true });
  });

  it('keeps the active workspace after the app restarts', () => {
    const folder = makeFolder('episode-12');
    const opened = createService().openFolder(folder, context);

    const restarted = createService().getState();

    expect(restarted.activeWorkspaceId).toBe(opened.id);
    expect(restarted.workspaces).toEqual([
      {
        brandId: 'brand-1',
        createdAt: '2026-11-27T10:00:01.000Z',
        id: opened.id,
        lastOpenedAt: '2026-11-27T10:00:01.000Z',
        name: 'episode-12',
        organizationId: 'org-1',
        path: folder,
        serverId: 'cloud',
      },
    ]);
  });

  it('reopening a folder updates its Library pairing instead of adding a second entry', () => {
    const folder = makeFolder('episode-12');
    const service = createService();
    const first = service.openFolder(folder, context);

    const second = service.openFolder(folder, {
      brandId: 'brand-2',
      organizationId: 'org-1',
    });

    expect(second.id).toBe(first.id);
    expect(service.getState().workspaces).toHaveLength(1);
    expect(service.getState().workspaces[0]?.brandId).toBe('brand-2');
  });

  it('keeps each server to its own workspaces and its own active one', () => {
    const cloudFolder = makeFolder('cloud-project');
    const selfHostedFolder = makeFolder('self-hosted-project');
    const service = createService();
    service.openFolder(cloudFolder, context);

    serverId = 'self-hosted:abc';
    expect(service.getState().workspaces).toEqual([]);
    expect(service.getState().activeWorkspaceId).toBeNull();

    const opened = service.openFolder(selfHostedFolder, {
      brandId: null,
      organizationId: 'org-9',
    });
    expect(service.getState().activeWorkspaceId).toBe(opened.id);
    expect(service.getState().workspaces.map((entry) => entry.path)).toEqual([
      selfHostedFolder,
    ]);

    serverId = 'cloud';
    expect(service.getState().workspaces.map((entry) => entry.path)).toEqual([
      cloudFolder,
    ]);
    expect(() => service.setActive(opened.id)).toThrow('Unknown workspace.');
  });

  it('lists the most recently opened workspace first', () => {
    const service = createService();
    const older = service.openFolder(makeFolder('older'), context);
    const newer = service.openFolder(makeFolder('newer'), context);

    expect(service.getState().workspaces.map(({ id }) => id)).toEqual([
      newer.id,
      older.id,
    ]);

    service.setActive(older.id);

    expect(service.getState().workspaces.map(({ id }) => id)).toEqual([
      older.id,
      newer.id,
    ]);
  });

  it('does not treat a folder deleted from disk as active, and keeps the record', () => {
    const folder = makeFolder('on-a-drive');
    const service = createService();
    const opened = service.openFolder(folder, context);

    fs.rmSync(folder, { recursive: true });

    expect(service.getState().activeWorkspaceId).toBeNull();
    expect(service.getState().workspaces).toHaveLength(1);
    expect(() => service.setActive(opened.id)).toThrow(
      'This folder no longer exists.',
    );
  });

  it('refuses a path that is not an existing folder', () => {
    const service = createService();
    fs.writeFileSync(path.join(base, 'file.txt'), 'x');

    expect(() =>
      service.openFolder(path.join(base, 'file.txt'), context),
    ).toThrow('Pick an existing folder.');
    expect(() => service.openFolder(path.join(base, 'nope'), context)).toThrow(
      'Pick an existing folder.',
    );
    expect(() => service.openFolder('relative/path', context)).toThrow(
      'Pick an existing folder.',
    );
  });

  it('forgets a removed workspace but leaves its files on disk', () => {
    const folder = makeFolder('episode-12');
    fs.writeFileSync(path.join(folder, 'recap.mp4'), 'video');
    const service = createService();
    const opened = service.openFolder(folder, context);

    service.remove(opened.id);

    expect(service.getState()).toMatchObject({
      activeWorkspaceId: null,
      workspaces: [],
    });
    expect(fs.readFileSync(path.join(folder, 'recap.mp4'), 'utf8')).toBe(
      'video',
    );
  });

  it('pairs a workspace with another brand later', () => {
    const service = createService();
    const opened = service.openFolder(makeFolder('episode-12'), {
      brandId: null,
      organizationId: null,
    });

    const linked = service.linkContext(opened.id, context);

    expect(linked).toMatchObject(context);
    expect(service.getWorkspace(opened.id)).toMatchObject(context);
  });

  describe('projects', () => {
    it('creates one folder per project under ~/.genfeedai/projects', () => {
      const service = createService();

      const project = service.createProject({ ...context, name: 'Episode 12' });

      expect(project.path).toBe(
        path.join(
          fs.realpathSync(home),
          '.genfeedai',
          'projects',
          'Episode 12',
        ),
      );
      expect(fs.statSync(project.path).isDirectory()).toBe(true);
      expect(service.getState().activeWorkspaceId).toBe(project.id);
    });

    it('never reuses an existing project folder', () => {
      const service = createService();

      const first = service.createProject({ ...context, name: 'Recap' });
      fs.writeFileSync(path.join(first.path, 'keep.txt'), 'mine');
      const second = service.createProject({ ...context, name: 'Recap' });

      expect(path.basename(second.path)).toBe('Recap 2');
      expect(fs.readFileSync(path.join(first.path, 'keep.txt'), 'utf8')).toBe(
        'mine',
      );
    });

    it.each([
      ['../../etc', 'etc'],
      ['a/b\\c', 'a b c'],
      ['  .hidden  ', 'hidden'],
    ])('turns the name %j into the folder name %j', (name, folderName) => {
      const project = createService().createProject({ ...context, name });

      expect(path.basename(project.path)).toBe(folderName);
      expect(path.dirname(project.path)).toBe(
        path.join(fs.realpathSync(home), '.genfeedai', 'projects'),
      );
    });

    it('refuses a name with no usable characters', () => {
      expect(() =>
        createService().createProject({ ...context, name: '../..' }),
      ).toThrow('Give the project a name.');
    });

    it('creates new projects in a projects home moved in Settings', () => {
      const moved = makeFolder('Videos');
      const service = createService();

      expect(service.setProjectsHome(moved).projectsHome).toBe(moved);
      const project = service.createProject({ ...context, name: 'Recap' });

      expect(project.path).toBe(path.join(moved, 'Recap'));
      expect(createService().getState().projectsHome).toBe(moved);
    });
  });

  describe('files inside the folder', () => {
    let folder: string;
    let service: DesktopWorkspaceService;
    let workspaceId: string;

    beforeEach(() => {
      folder = makeFolder('episode-12');
      fs.mkdirSync(path.join(folder, 'footage'));
      fs.writeFileSync(path.join(folder, 'footage', 'raw.mov'), '12345');
      fs.writeFileSync(path.join(folder, 'notes.md'), 'hi');
      service = createService();
      workspaceId = service.openFolder(folder, context).id;
    });

    it('lists folders first, with sizes and paths relative to the workspace', () => {
      expect(service.listDirectory(workspaceId)).toEqual([
        { isDirectory: true, name: 'footage', path: 'footage', size: 0 },
        { isDirectory: false, name: 'notes.md', path: 'notes.md', size: 2 },
      ]);
      expect(service.listDirectory(workspaceId, 'footage')).toEqual([
        {
          isDirectory: false,
          name: 'raw.mov',
          path: 'footage/raw.mov',
          size: 5,
        },
      ]);
    });

    it.each(['..', '../other-project', 'footage/../../other-project', '/etc'])(
      'refuses to read %s outside the folder',
      (relativePath) => {
        expect(() => service.listDirectory(workspaceId, relativePath)).toThrow(
          'Path escapes workspace root',
        );
      },
    );

    it('refuses to resolve a write target outside the folder', () => {
      expect(() => service.resolvePath(workspaceId, '../escape.txt')).toThrow(
        'Path escapes workspace root',
      );
      expect(service.resolvePath(workspaceId, 'renders/final.mp4')).toBe(
        path.join(folder, 'renders', 'final.mp4'),
      );
    });

    it('refuses a symlink out of the folder and leaves it out of listings', () => {
      const outside = makeFolder('somewhere-else');
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
      fs.symlinkSync(outside, path.join(folder, 'link'));

      expect(() => service.listDirectory(workspaceId, 'link')).toThrow(
        'Path escapes workspace root',
      );
      expect(() => service.resolvePath(workspaceId, 'link/new.txt')).toThrow(
        'Path escapes workspace root',
      );
      expect(
        service.listDirectory(workspaceId).map(({ name }) => name),
      ).toEqual(['footage', 'notes.md']);
    });

    it('refuses files in a workspace of another server', () => {
      serverId = 'self-hosted:abc';

      expect(() => service.listDirectory(workspaceId)).toThrow(
        'Unknown workspace.',
      );
    });
  });
});

describe('parseDesktopWorkspaceContext', () => {
  it('keeps ids and turns missing ones into null', () => {
    expect(
      parseDesktopWorkspaceContext({ brandId: 'b', organizationId: 'o' }),
    ).toEqual({ brandId: 'b', organizationId: 'o' });
    expect(parseDesktopWorkspaceContext({})).toEqual({
      brandId: null,
      organizationId: null,
    });
  });

  it.each([null, 'org-1', { brandId: 5 }, { organizationId: 'x'.repeat(200) }])(
    'refuses %j',
    (value) => {
      expect(() => parseDesktopWorkspaceContext(value)).toThrow(
        'Invalid workspace context.',
      );
    },
  );
});
