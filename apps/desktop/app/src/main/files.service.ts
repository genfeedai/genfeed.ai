import fs from 'node:fs/promises';
import path from 'node:path';
import { buildWorkspaceAssetsDir } from '@genfeedai/desktop-core';
import { dialog, shell } from 'electron';
import type { DesktopWorkspaceService } from './workspace.service';

export class DesktopFilesService {
  constructor(private readonly workspaceService: DesktopWorkspaceService) {}

  async readFile(workspaceId: string, relativePath: string): Promise<string> {
    const absolutePath = await this.workspaceService.assertInsideWorkspace(
      workspaceId,
      relativePath,
    );

    return fs.readFile(absolutePath, 'utf8');
  }

  async writeFile(
    workspaceId: string,
    relativePath: string,
    contents: string,
  ): Promise<void> {
    const absolutePath = await this.workspaceService.assertInsideWorkspace(
      workspaceId,
      relativePath,
    );

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents, 'utf8');
  }

  async importAssets(
    workspaceId: string,
    filePaths?: string[],
  ): Promise<string[]> {
    const workspace = await this.workspaceService.getWorkspace(workspaceId);
    const selectedFilePaths =
      filePaths && filePaths.length > 0
        ? filePaths
        : (
            await dialog.showOpenDialog({
              buttonLabel: 'Import Assets',
              properties: ['openFile', 'multiSelections'],
              title: 'Import Assets to Workspace',
            })
          ).filePaths;

    if (selectedFilePaths.length === 0) {
      return [];
    }

    const targetDirectory = buildWorkspaceAssetsDir(workspace.path);
    await fs.mkdir(targetDirectory, { recursive: true });

    const importedPaths: string[] = [];

    for (const sourceFilePath of selectedFilePaths) {
      const fileName = path.basename(sourceFilePath);
      const targetPath = path.join(targetDirectory, fileName);
      await fs.copyFile(sourceFilePath, targetPath);
      importedPaths.push(targetPath);
    }

    return importedPaths;
  }

  async revealPath(targetPath: string): Promise<void> {
    await shell.showItemInFolder(targetPath);
  }
}
