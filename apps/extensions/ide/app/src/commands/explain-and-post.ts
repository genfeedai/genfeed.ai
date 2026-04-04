import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import * as vscode from 'vscode';

const PLATFORM_OPTIONS = ['linkedin', 'twitter', 'x', 'instagram', 'blog'];

/**
 * Right-click selected code → "GenFeed: Explain & Post"
 *
 * Grabs the selected text, asks for a target platform, calls the GenFeed
 * generate API to produce a post that explains the code, then shows a preview
 * with a "Save to Drafts" option.
 */
export async function explainAndPost(
  _context: vscode.ExtensionContext,
): Promise<void> {
  const authService = AuthService.getInstance();
  if (!authService.isAuthenticated()) {
    const action = await vscode.window.showWarningMessage(
      'Sign in to GenFeed to explain & post code snippets.',
      'Sign In',
      'Use API Key',
    );
    if (action === 'Sign In') {
      await vscode.commands.executeCommand('genfeed.authenticate');
    } else if (action === 'Use API Key') {
      await vscode.commands.executeCommand('genfeed.setApiKey');
    }
    if (!AuthService.getInstance().isAuthenticated()) {
      return;
    }
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor found.');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection).trim();

  if (!selectedText) {
    vscode.window.showWarningMessage(
      'Select some code first, then run "GenFeed: Explain & Post".',
    );
    return;
  }

  const platform = await vscode.window.showQuickPick(PLATFORM_OPTIONS, {
    placeHolder: 'Target platform',
    title: 'Explain & Post — Choose Platform',
  });

  if (!platform) {
    return;
  }

  const language = editor.document.languageId;
  const fileName = editor.document.fileName.split('/').pop() ?? 'file';

  const prompt = buildExplainPrompt(selectedText, language, fileName, platform);

  const run = await vscode.window.withProgress(
    {
      cancellable: false,
      location: vscode.ProgressLocation.Notification,
      title: `GenFeed: generating ${platform} post…`,
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

  // Show preview in a virtual document
  const previewUri = vscode.Uri.parse(
    `untitled:genfeed-preview-${Date.now()}.md`,
  );
  const doc = await vscode.workspace.openTextDocument(previewUri);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(previewUri, new vscode.Position(0, 0), generatedText);
  await vscode.workspace.applyEdit(edit);
  await vscode.window.showTextDocument(doc, { preview: true });

  const action = await vscode.window.showInformationMessage(
    'GenFeed post generated!',
    'Save to Drafts',
    'Copy to Clipboard',
    'Dismiss',
  );

  if (action === 'Copy to Clipboard') {
    await vscode.env.clipboard.writeText(generatedText);
    vscode.window.showInformationMessage('Copied to clipboard.');
    return;
  }

  if (action === 'Save to Drafts') {
    try {
      await ApiService.getInstance().saveDraft({
        channel: platform,
        content: generatedText,
        sourceRunId: run._id ?? run.id,
        sourceType: 'explain-and-post',
      });
      vscode.window.showInformationMessage('Draft saved to GenFeed.');
      // Refresh status bar to reflect new draft count
      await vscode.commands.executeCommand('genfeed.refreshStatusBar');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to save draft: ${message}`);
    }
  }
}

function buildExplainPrompt(
  code: string,
  language: string,
  fileName: string,
  platform: string,
): string {
  return [
    `Write a compelling ${platform} post that explains the following ${language} code snippet from ${fileName}.`,
    'The post should be engaging, educational, and accessible to developers.',
    'Include what the code does, why it matters, and any interesting patterns or techniques used.',
    `Tailor the tone and length for ${platform}.`,
    '',
    '```' + language,
    code,
    '```',
  ].join('\n');
}

function extractGeneratedText(
  output: Record<string, unknown> | undefined,
): string | undefined {
  if (!output) {
    return undefined;
  }

  // Common output shapes from the GenFeed generate action
  for (const key of ['text', 'content', 'result', 'post', 'body']) {
    const value = output[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  // Nested: output.data.text or output.data.content
  const data = output['data'];
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
