import {
  AgentToolName,
  type AgentToolResult,
} from '@genfeedai/contracts/interfaces';
import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import { captureExtensionError } from '@services/error-tracking.service';
import { WorkspaceService } from '@services/workspace.service';
import type { AnalyticsViewProvider } from '@views/analytics-view.provider';
import type { GalleryViewProvider } from '@views/gallery-view.provider';
import type { PresetsViewProvider } from '@views/presets-view.provider';
import type { TemplatesViewProvider } from '@views/templates-view.provider';
import * as vscode from 'vscode';
import type { GenFeedStatusBar } from '@/statusBar';
import type {
  CampaignAuthoringContext,
  PromptTemplate,
  ToolActionType,
  WorkspaceCampaignDefaults,
} from '@/types';
import { explainAndPost } from './explain-and-post';

interface CommandProviders {
  analyticsProvider: AnalyticsViewProvider;
  templatesProvider: TemplatesViewProvider;
  presetsProvider?: PresetsViewProvider;
  galleryProvider?: GalleryViewProvider;
  statusBar?: GenFeedStatusBar;
}

type ActionPromptConfig = {
  label: string;
  placeholder: string;
};

const ACTION_PROMPTS: Record<ToolActionType, ActionPromptConfig> = {
  analytics: {
    label: 'Analytics metric (optional)',
    placeholder: 'engagement, reach, followers, impressions, or clicks',
  },
  generate: {
    label: 'Generation topic or brief',
    placeholder: 'Create five hooks for a launch thread',
  },
  post: {
    label: 'Post content',
    placeholder: 'Write the post to save as a Genfeed draft',
  },
};

const TOOL_BY_ACTION: Record<ToolActionType, AgentToolName> = {
  analytics: AgentToolName.GET_ANALYTICS,
  generate: AgentToolName.GENERATE_CONTENT,
  post: AgentToolName.CREATE_POST,
};

const CHANNEL_OPTIONS = [
  'twitter',
  'linkedin',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'newsletter',
];

const ANALYTICS_METRICS = new Set([
  'clicks',
  'engagement',
  'followers',
  'impressions',
  'reach',
]);

function buildToolParameters(
  actionType: ToolActionType,
  campaign: CampaignAuthoringContext,
): Record<string, unknown> {
  if (actionType === 'generate') {
    return {
      platform: campaign.channel,
      topic: campaign.actionInput,
      type: campaign.channel === 'newsletter' ? 'newsletter' : 'post',
    };
  }

  if (actionType === 'post') {
    return {
      content: campaign.actionInput,
      ...(campaign.channel === 'newsletter'
        ? {}
        : { platform: campaign.channel }),
    };
  }

  const metric = campaign.actionInput.trim().toLowerCase();
  return ANALYTICS_METRICS.has(metric) ? { metric } : {};
}

export function registerCommands(
  context: vscode.ExtensionContext,
  providers: CommandProviders,
): void {
  const requireAuth = async (): Promise<boolean> => {
    const authService = AuthService.getInstance();
    if (authService.isAuthenticated()) {
      return true;
    }

    const action = await vscode.window.showWarningMessage(
      'You need to sign in to run content actions.',
      'Sign In',
      'Use API Key',
    );
    if (action === 'Sign In') {
      await vscode.commands.executeCommand('genfeed.authenticate');
    } else if (action === 'Use API Key') {
      await vscode.commands.executeCommand('genfeed.setApiKey');
    }
    return AuthService.getInstance().isAuthenticated();
  };

  const refreshViews = async (): Promise<void> => {
    await Promise.all([
      providers.templatesProvider.refreshTemplates(),
      providers.analyticsProvider.refreshAnalytics(),
      providers.presetsProvider?.refreshPresets() ?? Promise.resolve(),
      providers.galleryProvider?.refreshMedia() ?? Promise.resolve(),
    ]);
  };

  const collectCampaignContext = async (
    actionType: ToolActionType,
    prefilledInput?: string,
  ): Promise<CampaignAuthoringContext | undefined> => {
    const defaults = (await WorkspaceService.readCampaignDefaults()) || {};
    const workspaceName = WorkspaceService.getWorkspaceName() || 'workspace';
    const prompt = ACTION_PROMPTS[actionType];

    const campaignName = await vscode.window.showInputBox({
      prompt: 'Campaign name',
      validateInput: (value) =>
        value.trim() ? null : 'Campaign name is required',
      value: defaults.defaultCampaignName || `${workspaceName} campaign`,
    });
    if (!campaignName) {
      return undefined;
    }

    const actionInput = await vscode.window.showInputBox({
      placeHolder: prompt.placeholder,
      prompt: prompt.label,
      value: prefilledInput,
      ...(actionType === 'analytics'
        ? {}
        : {
            validateInput: (value: string) =>
              value.trim() ? null : `${prompt.label} is required`,
          }),
    });
    if (actionInput === undefined) {
      return undefined;
    }

    const channel = await vscode.window.showQuickPick(CHANNEL_OPTIONS, {
      placeHolder: 'Primary channel',
      title: 'Campaign channel',
    });
    if (!channel) {
      return undefined;
    }

    return {
      actionInput,
      actionType,
      campaignName,
      channel,
      objective: defaults.defaultObjective,
    };
  };

  const executeToolAction = async (
    actionType: ToolActionType,
    prefilledInput?: string,
  ): Promise<AgentToolResult | undefined> => {
    if (!(await requireAuth())) {
      return undefined;
    }

    const campaign = await collectCampaignContext(actionType, prefilledInput);
    if (!campaign) {
      return undefined;
    }

    try {
      const result = await vscode.window.withProgress(
        {
          cancellable: false,
          location: vscode.ProgressLocation.Notification,
          title: `Running ${actionType} workflow…`,
        },
        () =>
          ApiService.getInstance().executeAgentTool(
            TOOL_BY_ACTION[actionType],
            buildToolParameters(actionType, campaign),
          ),
      );

      if (!result.success) {
        throw new Error(result.error || `${actionType} workflow failed.`);
      }

      const followUp = await vscode.window.showInformationMessage(
        `${actionType} workflow completed.`,
        'Copy Result',
        'Save Campaign Draft',
      );
      if (followUp === 'Copy Result') {
        await vscode.env.clipboard.writeText(
          JSON.stringify(result.data ?? {}, null, 2),
        );
      } else if (followUp === 'Save Campaign Draft') {
        const draftPath = await WorkspaceService.writeCampaignDraft(campaign);
        if (draftPath) {
          vscode.window.showInformationMessage(
            `Campaign draft saved: ${draftPath}`,
          );
        }
      }

      await refreshViews();
      return result;
    } catch (error) {
      captureExtensionError(`Command failed: ${actionType}`, error, {
        actionType,
        campaignName: campaign.campaignName,
      });
      throw error;
    }
  };

  const createCampaignCommand = async (): Promise<void> => {
    if (!WorkspaceService.getWorkspaceRootPath()) {
      vscode.window.showWarningMessage(
        'Open a workspace folder to create campaign defaults.',
      );
      return;
    }

    const existingDefaults =
      (await WorkspaceService.readCampaignDefaults()) ||
      ({} as WorkspaceCampaignDefaults);
    const defaultCampaignName = await vscode.window.showInputBox({
      prompt: 'Default campaign name',
      validateInput: (value) =>
        value.trim() ? null : 'Default campaign name is required',
      value: existingDefaults.defaultCampaignName,
    });
    if (!defaultCampaignName) {
      return;
    }

    const defaultChannel = await vscode.window.showQuickPick(CHANNEL_OPTIONS, {
      placeHolder: 'Default campaign channel',
    });
    if (!defaultChannel) {
      return;
    }

    const defaultObjective = await vscode.window.showInputBox({
      prompt: 'Default objective (optional)',
      value: existingDefaults.defaultObjective,
    });
    const configPath = await WorkspaceService.writeCampaignDefaults({
      defaultCampaignName,
      defaultChannel,
      defaultObjective,
    });
    if (configPath) {
      vscode.window.showInformationMessage(
        `Workspace campaign defaults saved at ${configPath}`,
      );
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.openPanel', async () => {
      await vscode.commands.executeCommand(
        'workbench.view.extension.genfeed-sidebar',
      );
      await vscode.commands.executeCommand('genfeed.templatesView.focus');
    }),
    vscode.commands.registerCommand('genfeed.explainAndPost', async () => {
      await explainAndPost(context);
    }),
    vscode.commands.registerCommand('genfeed.commitToPost', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
      }
      const { existsSync, readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const commitMsgPath = join(workspaceRoot, '.git', 'COMMIT_EDITMSG');
      if (!existsSync(commitMsgPath)) {
        vscode.window.showWarningMessage('No git repository found.');
        return;
      }
      const message = readFileSync(commitMsgPath, 'utf8').trim();
      if (!message || message.startsWith('#')) {
        vscode.window.showWarningMessage('No recent commit message found.');
        return;
      }
      const { triggerCommitToPost } = await import('./commit-to-post');
      await triggerCommitToPost(context, message);
    }),
    vscode.commands.registerCommand('genfeed.refreshStatusBar', async () => {
      await providers.statusBar?.refresh();
    }),
    vscode.commands.registerCommand('genfeed.generateContent', async () => {
      await executeToolAction('generate');
    }),
    vscode.commands.registerCommand('genfeed.postContent', async () => {
      await executeToolAction('post');
    }),
    vscode.commands.registerCommand('genfeed.showAnalytics', async () => {
      await executeToolAction('analytics');
    }),
    vscode.commands.registerCommand(
      'genfeed.generateContentFromTemplate',
      async (template?: PromptTemplate) => {
        let selectedTemplate = template;
        if (!selectedTemplate) {
          const templates =
            await ApiService.getInstance().getContentTemplates();
          const picked = await vscode.window.showQuickPick(
            templates.map((item) => ({
              description: item.channel || item.category || 'general',
              label: item.name,
              value: item,
            })),
            { placeHolder: 'Select a template' },
          );
          selectedTemplate = picked?.value;
        }
        if (selectedTemplate) {
          await executeToolAction('generate', selectedTemplate.template);
        }
      },
    ),
    vscode.commands.registerCommand('genfeed.createCampaign', async () => {
      await createCampaignCommand();
    }),
    vscode.commands.registerCommand('genfeed.authenticate', async () => {
      if (await AuthService.getInstance().authenticateWithDeviceFlow()) {
        await refreshViews();
      }
    }),
    vscode.commands.registerCommand('genfeed.signOut', async () => {
      await AuthService.getInstance().signOut();
      await refreshViews();
    }),
    vscode.commands.registerCommand('genfeed.setApiKey', async () => {
      const apiKey = await vscode.window.showInputBox({
        password: true,
        prompt: 'Enter your Genfeed.ai API key',
        validateInput: (value) =>
          value?.trim() && value.length >= 20 ? null : 'Enter a valid API key',
      });
      if (apiKey && (await AuthService.getInstance().setApiKey(apiKey))) {
        await refreshViews();
      }
    }),
    vscode.commands.registerCommand('genfeed.openTemplates', async () => {
      await vscode.commands.executeCommand(
        'workbench.view.extension.genfeed-sidebar',
      );
      await vscode.commands.executeCommand('genfeed.templatesView.focus');
    }),
    vscode.commands.registerCommand('genfeed.openAnalyticsView', async () => {
      await vscode.commands.executeCommand(
        'workbench.view.extension.genfeed-sidebar',
      );
      await vscode.commands.executeCommand('genfeed.analyticsView.focus');
    }),
    vscode.commands.registerCommand('genfeed.toggleSidebar', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.toggleSidebarVisibility',
      );
    }),
    vscode.commands.registerCommand('genfeed.refreshTemplates', async () => {
      await providers.templatesProvider.refreshTemplates();
    }),
    vscode.commands.registerCommand(
      'genfeed.refreshAnalyticsView',
      async () => {
        await providers.analyticsProvider.refreshAnalytics();
      },
    ),
  );

  if (providers.presetsProvider) {
    context.subscriptions.push(
      vscode.commands.registerCommand('genfeed.openPresets', () =>
        vscode.commands.executeCommand('genfeed.presetsView.focus'),
      ),
      vscode.commands.registerCommand('genfeed.refreshPresets', async () => {
        await providers.presetsProvider?.refreshPresets();
      }),
    );
  }

  if (providers.galleryProvider) {
    context.subscriptions.push(
      vscode.commands.registerCommand('genfeed.openGallery', () =>
        vscode.commands.executeCommand('genfeed.galleryView.focus'),
      ),
      vscode.commands.registerCommand('genfeed.refreshGallery', async () => {
        await providers.galleryProvider?.refreshMedia();
      }),
    );
  }
}
