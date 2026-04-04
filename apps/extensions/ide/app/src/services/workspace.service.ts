import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type {
  CampaignAuthoringContext,
  RunArtifactBundle,
  RunTimelineEvent,
  WorkspaceCampaignDefaults,
} from '@/types';

const WORKSPACE_ROOT_DIR = '.genfeed';
const WORKSPACE_CONFIG_FILE = 'content-engine.json';

function sanitizeFileSegment(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getWorkspaceConfigPath(rootPath: string): string {
  return path.join(rootPath, WORKSPACE_ROOT_DIR, WORKSPACE_CONFIG_FILE);
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export const WorkspaceService = {
  createTimelineEvent(
    stage: string,
    message: string,
    level: RunTimelineEvent['level'] = 'info',
    data?: Record<string, unknown>,
  ): RunTimelineEvent {
    return {
      data,
      level,
      message,
      stage,
      timestamp: new Date().toISOString(),
    };
  },

  getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const [workspaceFolder] = vscode.workspace.workspaceFolders ?? [];
    return workspaceFolder;
  },

  getWorkspaceName(): string | undefined {
    return WorkspaceService.getWorkspaceFolder()?.name;
  },

  getWorkspaceRootPath(): string | undefined {
    return WorkspaceService.getWorkspaceFolder()?.uri.fsPath;
  },

  async readCampaignDefaults(): Promise<WorkspaceCampaignDefaults | undefined> {
    const rootPath = WorkspaceService.getWorkspaceRootPath();
    if (!rootPath) {
      return undefined;
    }

    const configPath = getWorkspaceConfigPath(rootPath);

    try {
      const data = await fs.readFile(configPath, 'utf8');
      return JSON.parse(data) as WorkspaceCampaignDefaults;
    } catch {
      return undefined;
    }
  },

  async writeCampaignDefaults(
    defaults: WorkspaceCampaignDefaults,
  ): Promise<string | undefined> {
    const rootPath = WorkspaceService.getWorkspaceRootPath();
    if (!rootPath) {
      return undefined;
    }

    const configDir = path.join(rootPath, WORKSPACE_ROOT_DIR);
    await ensureDirectory(configDir);

    const configPath = getWorkspaceConfigPath(rootPath);
    await fs.writeFile(configPath, `${JSON.stringify(defaults, null, 2)}\n`);

    return configPath;
  },

  async writeCampaignDraft(
    campaign: CampaignAuthoringContext,
  ): Promise<string | undefined> {
    const rootPath = WorkspaceService.getWorkspaceRootPath();
    if (!rootPath) {
      return undefined;
    }

    const campaignsDir = path.join(rootPath, WORKSPACE_ROOT_DIR, 'campaigns');
    await ensureDirectory(campaignsDir);

    const campaignFile = `${sanitizeFileSegment(campaign.campaignName) || 'campaign'}-${timestampSuffix()}.json`;
    const campaignPath = path.join(campaignsDir, campaignFile);

    await fs.writeFile(
      campaignPath,
      `${JSON.stringify(
        {
          ...campaign,
          createdAt: new Date().toISOString(),
          workspace: WorkspaceService.getWorkspaceName(),
        },
        null,
        2,
      )}\n`,
    );

    return campaignPath;
  },

  async writeRunArtifacts(
    runId: string,
    artifact: RunArtifactBundle,
  ): Promise<string | undefined> {
    const rootPath = WorkspaceService.getWorkspaceRootPath();
    if (!rootPath) {
      return undefined;
    }

    const normalizedRunId = sanitizeFileSegment(runId) || 'run';
    const runDir = path.join(
      rootPath,
      WORKSPACE_ROOT_DIR,
      'runs',
      normalizedRunId,
    );
    await ensureDirectory(runDir);

    await fs.writeFile(
      path.join(runDir, 'run.json'),
      `${JSON.stringify(artifact.run, null, 2)}\n`,
    );

    if (artifact.campaign) {
      await fs.writeFile(
        path.join(runDir, 'campaign.json'),
        `${JSON.stringify(artifact.campaign, null, 2)}\n`,
      );
    }

    await fs.writeFile(
      path.join(runDir, 'timeline.json'),
      `${JSON.stringify(artifact.timeline, null, 2)}\n`,
    );

    const logs = artifact.timeline
      .map((event) => JSON.stringify(event))
      .join('\n');
    await fs.writeFile(path.join(runDir, 'logs.ndjson'), `${logs}\n`);

    return runDir;
  },
};
