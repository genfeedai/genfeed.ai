import * as fs from 'node:fs';
import * as path from 'node:path';
import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import * as vscode from 'vscode';

/**
 * Public entry point for the manual `genfeed.commitToPost` command.
 * Exposed here so commands/index.ts can call it without duplicating the logic.
 */
export async function triggerCommitToPost(
  context: vscode.ExtensionContext,
  commitMessage: string,
): Promise<void> {
  await handleNewCommit(context, commitMessage);
}

/**
 * Watches for new git commits in open workspace folders and prompts the user
 * to turn the commit message into a social post.
 *
 * Strategy: `fs.watch` on each workspace folder's `.git/COMMIT_EDITMSG`.
 * That file is written by git on every commit.
 */
export function registerCommitToPostWatcher(
  context: vscode.ExtensionContext,
): void {
  const watchers: fs.FSWatcher[] = [];

  const attachWatcher = (workspaceRoot: string): void => {
    const commitMsgPath = path.join(workspaceRoot, '.git', 'COMMIT_EDITMSG');

    if (!fs.existsSync(commitMsgPath)) {
      return; // Not a git repo (yet)
    }

    let lastMtime = fs.statSync(commitMsgPath).mtimeMs;

    const watcher = fs.watch(commitMsgPath, async () => {
      try {
        const stat = fs.statSync(commitMsgPath);
        if (stat.mtimeMs === lastMtime) {
          return; // Spurious event — no actual change
        }
        lastMtime = stat.mtimeMs;

        const message = fs.readFileSync(commitMsgPath, 'utf8').trim();
        if (!message || message.startsWith('#')) {
          return; // Empty or comment-only commit message
        }

        await handleNewCommit(context, message);
      } catch {
        // Ignore — file may be temporarily missing during git operations
      }
    });

    watchers.push(watcher);
  };

  // Watch all currently open workspace folders
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    attachWatcher(folder.uri.fsPath);
  }

  // Also watch folders added during the session
  const folderChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(
    (event) => {
      for (const folder of event.added) {
        attachWatcher(folder.uri.fsPath);
      }
    },
  );

  context.subscriptions.push(folderChangeDisposable, {
    dispose: () => {
      for (const w of watchers) {
        w.close();
      }
    },
  });
}

async function handleNewCommit(
  _context: vscode.ExtensionContext,
  commitMessage: string,
): Promise<void> {
  const shortMessage =
    commitMessage.length > 72
      ? `${commitMessage.slice(0, 72)}…`
      : commitMessage;

  const action = await vscode.window.showInformationMessage(
    `New commit: "${shortMessage}" — turn it into a post?`,
    'Yes',
    'No',
  );

  if (action !== 'Yes') {
    return;
  }

  if (!AuthService.getInstance().isAuthenticated()) {
    const authAction = await vscode.window.showWarningMessage(
      'Sign in to GenFeed to generate posts from commits.',
      'Sign In',
      'Use API Key',
    );
    if (authAction === 'Sign In') {
      await vscode.commands.executeCommand('genfeed.authenticate');
    } else if (authAction === 'Use API Key') {
      await vscode.commands.executeCommand('genfeed.setApiKey');
    }
    if (!AuthService.getInstance().isAuthenticated()) {
      return;
    }
  }

  const platform = await vscode.window.showQuickPick(
    ['linkedin', 'twitter', 'x', 'instagram', 'blog'],
    {
      placeHolder: 'Target platform',
      title: 'Commit → Post — Choose Platform',
    },
  );

  if (!platform) {
    return;
  }

  const prompt = buildCommitPrompt(commitMessage, platform);

  const run = await vscode.window.withProgress(
    {
      cancellable: false,
      location: vscode.ProgressLocation.Notification,
      title: `GenFeed: generating ${platform} post from commit…`,
    },
    () =>
      ApiService.getInstance().createAndExecuteRun('generate', {
        channel: platform,
        prompt,
      }),
  );

  const generatedText = extractGeneratedText(run.output);

  if (!generatedText) {
    vscode.window.showErrorMessage(
      `GenFeed: generation failed (run ${run._id ?? run.id ?? 'unknown'}).`,
    );
    return;
  }

  // Show in a preview document
  const previewUri = vscode.Uri.parse(
    `untitled:genfeed-commit-post-${Date.now()}.md`,
  );
  const doc = await vscode.workspace.openTextDocument(previewUri);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(previewUri, new vscode.Position(0, 0), generatedText);
  await vscode.workspace.applyEdit(edit);
  await vscode.window.showTextDocument(doc, { preview: true });

  const followUp = await vscode.window.showInformationMessage(
    'GenFeed post from commit ready!',
    'Save to Drafts',
    'Copy to Clipboard',
    'Dismiss',
  );

  if (followUp === 'Copy to Clipboard') {
    await vscode.env.clipboard.writeText(generatedText);
    vscode.window.showInformationMessage('Copied to clipboard.');
    return;
  }

  if (followUp === 'Save to Drafts') {
    try {
      await ApiService.getInstance().saveDraft({
        channel: platform,
        commitMessage,
        content: generatedText,
        sourceRunId: run._id ?? run.id,
        sourceType: 'commit-to-post',
      });
      vscode.window.showInformationMessage('Draft saved to GenFeed.');
      await vscode.commands.executeCommand('genfeed.refreshStatusBar');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to save draft: ${message}`);
    }
  }
}

function buildCommitPrompt(commitMessage: string, platform: string): string {
  return [
    `Write a compelling ${platform} post inspired by this git commit message:`,
    '',
    `"${commitMessage}"`,
    '',
    `Explain what was shipped, why it matters, and make it exciting for a developer audience.`,
    `Tailor the tone and length for ${platform}.`,
  ].join('\n');
}

function extractGeneratedText(
  output: Record<string, unknown> | undefined,
): string | undefined {
  if (!output) {
    return undefined;
  }

  for (const key of ['text', 'content', 'result', 'post', 'body']) {
    const value = output[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  const data = output.data;
  if (data && typeof data === 'object') {
    const dataObj = data as Record<string, unknown>;
    for (const key of ['text', 'content', 'result', 'post', 'body']) {
      const value = dataObj[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }

  return undefined;
}
