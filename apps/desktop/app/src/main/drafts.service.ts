import fs from 'node:fs/promises';
import type { IDesktopContentRunDraft } from '@genfeedai/desktop-contracts';
import {
  buildWorkspaceDraftsPath,
  buildWorkspaceMetadataDir,
} from '@genfeedai/desktop-core';
import { DesktopWorkspaceService } from './workspace.service';

export class DesktopDraftsService {
  constructor(private readonly workspaceService: DesktopWorkspaceService) {}

  private async readDraftsFile(
    workspaceId: string,
  ): Promise<IDesktopContentRunDraft[]> {
    const workspace = this.workspaceService.getWorkspace(workspaceId);
    const metadataDir = buildWorkspaceMetadataDir(workspace.path);
    const draftsPath = buildWorkspaceDraftsPath(workspace.path);

    await fs.mkdir(metadataDir, { recursive: true });

    try {
      const raw = await fs.readFile(draftsPath, 'utf8');
      const parsed = JSON.parse(raw) as IDesktopContentRunDraft[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeDraftsFile(
    workspaceId: string,
    drafts: IDesktopContentRunDraft[],
  ): Promise<void> {
    const workspace = this.workspaceService.getWorkspace(workspaceId);
    const draftsPath = buildWorkspaceDraftsPath(workspace.path);

    await fs.writeFile(draftsPath, JSON.stringify(drafts, null, 2), 'utf8');
  }

  async listDrafts(workspaceId: string): Promise<IDesktopContentRunDraft[]> {
    const drafts = await this.readDraftsFile(workspaceId);

    return drafts.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async getDraft(
    workspaceId: string,
    draftId: string,
  ): Promise<IDesktopContentRunDraft | null> {
    const drafts = await this.readDraftsFile(workspaceId);

    return drafts.find((draft) => draft.id === draftId) ?? null;
  }

  async saveDraft(
    workspaceId: string,
    draft: IDesktopContentRunDraft,
  ): Promise<IDesktopContentRunDraft> {
    const drafts = await this.readDraftsFile(workspaceId);
    const nextDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
      workspaceId,
    } satisfies IDesktopContentRunDraft;

    const nextDrafts = drafts.some((item) => item.id === nextDraft.id)
      ? drafts.map((item) => (item.id === nextDraft.id ? nextDraft : item))
      : [nextDraft, ...drafts];

    await this.writeDraftsFile(workspaceId, nextDrafts);

    return nextDraft;
  }

  async deleteDraft(workspaceId: string, draftId: string): Promise<void> {
    const drafts = await this.readDraftsFile(workspaceId);
    const nextDrafts = drafts.filter((draft) => draft.id !== draftId);

    await this.writeDraftsFile(workspaceId, nextDrafts);
  }
}
