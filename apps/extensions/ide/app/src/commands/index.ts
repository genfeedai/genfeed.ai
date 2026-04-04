import { ApiService } from '@services/api.service';
import { AuthService } from '@services/auth.service';
import {
  type ContentLoopStep,
  executeContentLoop,
} from '@services/content-loop.service';
import { captureExtensionError } from '@services/error-tracking.service';
import { WorkspaceService } from '@services/workspace.service';
import type { AnalyticsViewProvider } from '@views/analytics-view.provider';
import type { GalleryViewProvider } from '@views/gallery-view.provider';
import type { PresetsViewProvider } from '@views/presets-view.provider';
import type { RunQueueViewProvider } from '@views/run-queue-view.provider';
import type { TemplatesViewProvider } from '@views/templates-view.provider';
import * as vscode from 'vscode';
import type { GenFeedStatusBar } from '@/statusBar';
import {
  type CampaignAuthoringContext,
  IngredientFormat,
  MODEL_DISPLAY_NAMES,
  type ModelKey,
  type PromptTemplate,
  type RunActionType,
  type RunRecord,
  type RunTimelineEvent,
  type WorkspaceCampaignDefaults,
} from '@/types';
import { explainAndPost } from './explain-and-post';

interface CommandProviders {
  runQueueProvider: RunQueueViewProvider;
  templatesProvider: TemplatesViewProvider;
  analyticsProvider: AnalyticsViewProvider;
  presetsProvider?: PresetsViewProvider;
  galleryProvider?: GalleryViewProvider;
  statusBar?: GenFeedStatusBar;
}

type ActionPromptConfig = {
  label: string;
  placeholder: string;
  targetKey: string;
};

const RUN_PROMPTS: Record<RunActionType, ActionPromptConfig> = {
  analytics: {
    label: 'Analytics query',
    placeholder: 'campaign performance summary by channel',
    targetKey: 'query',
  },
  composite: {
    label: 'Composite run brief',
    placeholder: 'Generate, publish, and analyze this campaign',
    targetKey: 'brief',
  },
  generate: {
    label: 'Generation prompt',
    placeholder: 'Create five hooks for a launch thread',
    targetKey: 'prompt',
  },
  post: {
    label: 'Post payload or draft reference',
    placeholder: 'draft_abc123',
    targetKey: 'payload',
  },
};

const CHANNEL_OPTIONS = [
  'x',
  'linkedin',
  'instagram',
  'tiktok',
  'youtube',
  'email',
  'blog',
];

export function registerCommands(
  context: vscode.ExtensionContext,
  providers: CommandProviders,
): void {
  const outputChannel = vscode.window.createOutputChannel('Genfeed.ai Content');
  context.subscriptions.push(outputChannel);

  const log = (event: RunTimelineEvent, timeline: RunTimelineEvent[]): void => {
    timeline.push(event);
    outputChannel.appendLine(
      `${event.timestamp} [${event.level.toUpperCase()}] ${event.stage}: ${event.message}${event.data ? ` ${JSON.stringify(event.data)}` : ''}`,
    );
  };

  // ── New IDE-native commands (#668) ──────────────────────────────────────

  // openPanel — Cmd/Ctrl+Shift+G opens the sidebar
  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.openPanel', async () => {
      await vscode.commands.executeCommand(
        'workbench.view.extension.genfeed-sidebar',
      );
      await vscode.commands.executeCommand('genfeed.runQueueView.focus');
    }),
  );

  // explainAndPost — right-click selected code
  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.explainAndPost', async () => {
      await explainAndPost(context);
    }),
  );

  // commitToPost — manual trigger; reads the latest COMMIT_EDITMSG
  context.subscriptions.push(
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
        vscode.window.showWarningMessage(
          'No git repository found in the current workspace.',
        );
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
  );

  // refreshStatusBar — used by explain-and-post and commit-to-post after saving drafts
  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.refreshStatusBar', async () => {
      await providers.statusBar?.refresh();
    }),
  );

  // ── End new commands ─────────────────────────────────────────────────────

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
      return AuthService.getInstance().isAuthenticated();
    }

    if (action === 'Use API Key') {
      await vscode.commands.executeCommand('genfeed.setApiKey');
      return AuthService.getInstance().isAuthenticated();
    }

    return false;
  };

  const refreshViews = async (): Promise<void> => {
    await Promise.all([
      providers.runQueueProvider.refreshRuns(),
      providers.templatesProvider.refreshTemplates(),
      providers.analyticsProvider.refreshAnalytics(),
      providers.presetsProvider?.refreshPresets() ?? Promise.resolve(),
      providers.galleryProvider?.refreshMedia() ?? Promise.resolve(),
    ]);
  };

  const openGenfeedSidebar = async (): Promise<void> => {
    await vscode.commands.executeCommand(
      'workbench.view.extension.genfeed-sidebar',
    );
    await vscode.commands.executeCommand('genfeed.runQueueView.focus');
  };

  const collectCampaignContext = async (
    actionType: RunActionType,
    options?: {
      prefilledCampaignName?: string;
      prefilledInput?: string;
    },
  ): Promise<CampaignAuthoringContext | undefined> => {
    const defaults = (await WorkspaceService.readCampaignDefaults()) || {};
    const workspaceName = WorkspaceService.getWorkspaceName() || 'workspace';
    const prompt = RUN_PROMPTS[actionType];

    const campaignName = await vscode.window.showInputBox({
      prompt: 'Campaign name',
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Campaign name is required';
        }
        return null;
      },
      value:
        options?.prefilledCampaignName ||
        defaults.defaultCampaignName ||
        `${workspaceName} campaign`,
    });

    if (!campaignName) {
      return undefined;
    }

    const actionInput = await vscode.window.showInputBox({
      placeHolder: prompt.placeholder,
      prompt: prompt.label,
      validateInput: (value) => {
        if (!value.trim()) {
          return `${prompt.label} is required`;
        }
        return null;
      },
      value: options?.prefilledInput,
    });

    if (!actionInput) {
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

  const saveCampaignDraft = async (
    campaign: CampaignAuthoringContext,
  ): Promise<void> => {
    const draftPath = await WorkspaceService.writeCampaignDraft(campaign);
    if (draftPath) {
      vscode.window.showInformationMessage(
        `Campaign draft saved: ${draftPath}`,
      );
    } else {
      vscode.window.showWarningMessage(
        'No workspace is open, campaign draft was not written.',
      );
    }
  };

  const resolveRunId = (run: RunRecord): string => {
    const runId = run._id || run.id;
    if (!runId) {
      throw new Error('Run response is missing an id.');
    }
    return runId;
  };

  const getTraceId = (run: RunRecord): string | undefined => {
    if (run.traceId) {
      return run.traceId;
    }

    if (run.output && typeof run.output === 'object') {
      const maybeTraceId = (run.output as Record<string, unknown>).traceId;
      if (typeof maybeTraceId === 'string') {
        return maybeTraceId;
      }
    }

    return undefined;
  };

  const writeArtifactsForRun = async (
    run: RunRecord,
    campaign: CampaignAuthoringContext | undefined,
    timeline: RunTimelineEvent[],
  ): Promise<void> => {
    const runId = resolveRunId(run);
    const remoteTimeline = await safeLoadTimeline(runId);
    const artifactPath = await WorkspaceService.writeRunArtifacts(runId, {
      campaign,
      run,
      timeline: remoteTimeline.length ? remoteTimeline : timeline,
    });

    if (artifactPath) {
      vscode.window.showInformationMessage(
        `Artifacts saved to ${artifactPath}`,
      );
    } else {
      vscode.window.showWarningMessage(
        'No workspace is open, artifacts were not written.',
      );
    }
  };

  const safeLoadTimeline = async (
    runId: string,
  ): Promise<RunTimelineEvent[]> => {
    try {
      return await ApiService.getInstance().getRunTimeline(runId);
    } catch {
      return [];
    }
  };

  const executeRunAction = async (
    actionType: RunActionType,
    options?: {
      campaignContext?: CampaignAuthoringContext;
      metadata?: Record<string, unknown>;
      prefilledInput?: string;
      prefilledCampaignName?: string;
    },
  ): Promise<RunRecord | undefined> => {
    const authenticated = await requireAuth();
    if (!authenticated) {
      return undefined;
    }

    const campaign =
      options?.campaignContext ||
      (await collectCampaignContext(actionType, {
        prefilledCampaignName: options?.prefilledCampaignName,
        prefilledInput: options?.prefilledInput,
      }));

    if (!campaign) {
      return undefined;
    }

    const timeline: RunTimelineEvent[] = [];
    log(
      WorkspaceService.createTimelineEvent(
        actionType,
        'Starting run execution',
        'info',
        {
          campaignName: campaign.campaignName,
          channel: campaign.channel,
          workspace: WorkspaceService.getWorkspaceName(),
        },
      ),
      timeline,
    );

    const actionPrompt = RUN_PROMPTS[actionType];
    const runInput = {
      [actionPrompt.targetKey]: campaign.actionInput,
      campaign: {
        channel: campaign.channel,
        name: campaign.campaignName,
        objective: campaign.objective,
      },
    };

    let run: RunRecord;
    try {
      run = await vscode.window.withProgress(
        {
          cancellable: false,
          location: vscode.ProgressLocation.Notification,
          title: `Running ${actionType} action...`,
        },
        () => {
          const apiService = ApiService.getInstance();
          return apiService.createAndExecuteRun(actionType, runInput, {
            campaign,
            metadata: {
              campaignName: campaign.campaignName,
              channel: campaign.channel,
              source: 'ide.command',
              workspace: WorkspaceService.getWorkspaceName(),
              ...options?.metadata,
            },
          });
        },
      );
    } catch (error) {
      captureExtensionError(`Command failed: ${actionType}`, error, {
        actionType,
        campaignName: campaign.campaignName,
        channel: campaign.channel,
      });
      throw error;
    }

    const runId = resolveRunId(run);
    log(
      WorkspaceService.createTimelineEvent(
        actionType,
        'Run execution completed',
        run.status === 'failed' ? 'error' : 'info',
        {
          runId,
          status: run.status,
        },
      ),
      timeline,
    );

    await refreshViews();

    const followUp = await vscode.window.showInformationMessage(
      `Run ${runId} is ${run.status}.`,
      'View Status',
      'Copy Run ID',
      'Save Artifacts',
      'Save Campaign Draft',
    );

    if (followUp === 'View Status') {
      await vscode.commands.executeCommand('genfeed.runStatus', runId);
    }

    if (followUp === 'Copy Run ID') {
      await vscode.env.clipboard.writeText(runId);
    }

    if (followUp === 'Save Artifacts') {
      await writeArtifactsForRun(run, campaign, timeline);
    }

    if (followUp === 'Save Campaign Draft') {
      await saveCampaignDraft(campaign);
    }

    return run;
  };

  const runStatusCommand = async (providedRunId?: string): Promise<void> => {
    const runId =
      providedRunId ||
      (await vscode.window.showInputBox({
        placeHolder: 'Run ID',
        prompt: 'Check run status',
      }));

    if (!runId) {
      return;
    }

    const run = await ApiService.getInstance().getRun(runId);
    const traceId = getTraceId(run);

    const details = [
      `Run: ${resolveRunId(run)}`,
      `Action: ${run.actionType}`,
      `Status: ${run.status}`,
      `Progress: ${run.progress}%`,
      `Trace: ${traceId || 'n/a'}`,
    ].join('\n');

    const actions = ['Copy Run ID', 'Save Artifacts'];
    if (traceId) {
      actions.push('Copy Trace ID');
    }

    const followUp = await vscode.window.showInformationMessage(
      details,
      ...actions,
    );

    if (followUp === 'Copy Run ID') {
      await vscode.env.clipboard.writeText(resolveRunId(run));
    }

    if (followUp === 'Copy Trace ID' && traceId) {
      await vscode.env.clipboard.writeText(traceId);
    }

    if (followUp === 'Save Artifacts') {
      await writeArtifactsForRun(run, inferCampaignContextFromRun(run), []);
    }
  };

  const runFullLoopCommand = async (): Promise<void> => {
    const authenticated = await requireAuth();
    if (!authenticated) {
      return;
    }

    const config = vscode.workspace.getConfiguration('genfeed');
    const preferAgentMode = config.get<boolean>('agentMode', true);

    const modePick = await vscode.window.showQuickPick(
      [
        {
          description: 'Single composite run action',
          label: 'Composite API Run',
          mode: 'composite',
        },
        {
          description: 'Generate -> publish (approval) -> analytics',
          label: 'Agent Mode',
          mode: 'agent',
        },
      ],
      {
        placeHolder: 'Run full loop mode',
      },
    );

    const mode = modePick?.mode || (preferAgentMode ? 'agent' : 'composite');

    if (mode === 'composite') {
      await executeRunAction('composite', {
        metadata: {
          mode: 'composite',
        },
      });
      return;
    }

    const campaign = await collectCampaignContext('generate');
    if (!campaign) {
      return;
    }

    const publishPayload = await vscode.window.showInputBox({
      placeHolder: 'draft_abc123',
      prompt: 'Publish payload or draft reference',
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Publish payload is required';
        }
        return null;
      },
      value: `draft:${campaign.campaignName}`,
    });

    if (!publishPayload) {
      return;
    }

    const analyticsQuery = await vscode.window.showInputBox({
      placeHolder: 'performance summary by channel and engagement',
      prompt: 'Analytics query',
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Analytics query is required';
        }
        return null;
      },
      value: `${campaign.campaignName} performance summary`,
    });

    if (!analyticsQuery) {
      return;
    }

    const planConfirmation = await vscode.window.showInformationMessage(
      `Agent plan for ${campaign.campaignName}: generate -> publish -> analytics.`,
      'Run Plan',
      'Cancel',
    );

    if (planConfirmation !== 'Run Plan') {
      return;
    }

    const steps: ContentLoopStep[] = [
      {
        actionType: 'generate',
        id: 'create',
        input: {
          [RUN_PROMPTS.generate.targetKey]: campaign.actionInput,
          campaign: {
            channel: campaign.channel,
            name: campaign.campaignName,
            objective: campaign.objective,
          },
        },
        metadata: {
          mode: 'agent',
          step: 'create',
        },
      },
      {
        actionType: 'post',
        haltOnRejection: true,
        id: 'publish',
        input: {
          [RUN_PROMPTS.post.targetKey]: publishPayload,
          campaign: {
            channel: campaign.channel,
            name: campaign.campaignName,
            objective: campaign.objective,
          },
        },
        metadata: {
          mode: 'agent',
          step: 'publish',
        },
        requireConfirmation: true,
      },
      {
        actionType: 'analytics',
        id: 'analytics',
        input: {
          [RUN_PROMPTS.analytics.targetKey]: analyticsQuery,
          campaign: {
            channel: campaign.channel,
            name: campaign.campaignName,
            objective: campaign.objective,
          },
        },
        metadata: {
          mode: 'agent',
          step: 'analytics',
        },
      },
    ];

    const result = await executeContentLoop({
      confirmStep: async (step) => {
        if (step.id !== 'publish') {
          return true;
        }

        const confirmation = await vscode.window.showWarningMessage(
          'Agent mode requires explicit confirmation before publish. Proceed with post step?',
          {
            modal: true,
          },
          'Publish',
          'Abort',
        );

        return confirmation === 'Publish';
      },
      executeRun: (actionType, input, loopOptions) => {
        return ApiService.getInstance().createAndExecuteRun(actionType, input, {
          campaign,
          metadata: {
            campaignName: campaign.campaignName,
            channel: campaign.channel,
            source: 'ide.agent',
            workspace: WorkspaceService.getWorkspaceName(),
            ...loopOptions?.metadata,
          },
        });
      },
      steps,
    });

    await refreshViews();

    const statuses = result.runs
      .map((run) => `${run.actionType}:${run.status}`)
      .join(', ');
    const summary = result.abortedAt
      ? `Agent loop stopped at ${result.abortedAt}. Completed steps: ${statuses || 'none'}.`
      : `Agent loop completed. ${statuses}`;

    const followUp = await vscode.window.showInformationMessage(
      summary,
      'Save Artifacts',
      'Save Campaign Draft',
      'View Last Run Status',
    );

    if (followUp === 'Save Campaign Draft') {
      await saveCampaignDraft(campaign);
    }

    if (followUp === 'View Last Run Status') {
      const lastRun = result.runs.at(-1);
      if (lastRun) {
        await vscode.commands.executeCommand(
          'genfeed.runStatus',
          resolveRunId(lastRun),
        );
      }
    }

    if (followUp === 'Save Artifacts') {
      await Promise.all(
        result.runs.map((run) =>
          writeArtifactsForRun(run, campaign, result.timeline),
        ),
      );
    }
  };

  const createCampaignCommand = async (): Promise<void> => {
    const workspacePath = WorkspaceService.getWorkspaceRootPath();
    if (!workspacePath) {
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
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Default campaign name is required';
        }
        return null;
      },
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
      const action = await vscode.window.showInformationMessage(
        `Workspace campaign defaults saved at ${configPath}`,
        'Open File',
      );
      if (action === 'Open File') {
        const uri = vscode.Uri.file(configPath);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
      }
    }
  };

  // Generate image command kept for backwards compatibility.
  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.generateImage', async () => {
      const authenticated = await requireAuth();
      if (!authenticated) {
        return;
      }

      const prompt = await vscode.window.showInputBox({
        placeHolder: 'A serene mountain landscape at sunset...',
        prompt: 'Enter your image prompt',
        validateInput: (value) => {
          if (!value?.trim()) {
            return 'Prompt cannot be empty';
          }
          return null;
        },
      });

      if (!prompt) {
        return;
      }

      const formatItems: vscode.QuickPickItem[] = [
        {
          description: '1920x1080',
          detail: 'Best for banners and headers',
          label: 'Landscape',
        },
        {
          description: '1080x1920',
          detail: 'Best for stories and mobile',
          label: 'Portrait',
        },
        {
          description: '1024x1024',
          detail: 'Best for social media posts',
          label: 'Square',
        },
      ];

      const selectedFormat = await vscode.window.showQuickPick(formatItems, {
        placeHolder: 'Select image format',
      });

      if (!selectedFormat) {
        return;
      }

      const formatMap: Record<string, IngredientFormat> = {
        Landscape: IngredientFormat.LANDSCAPE,
        Portrait: IngredientFormat.PORTRAIT,
        Square: IngredientFormat.SQUARE,
      };

      const modelItems: vscode.QuickPickItem[] = Object.entries(
        MODEL_DISPLAY_NAMES,
      ).map(([key, name]) => ({
        description: key,
        label: name,
      }));

      const selectedModel = await vscode.window.showQuickPick(modelItems, {
        placeHolder: 'Select AI model (or use default)',
      });

      await vscode.window.withProgress(
        {
          cancellable: false,
          location: vscode.ProgressLocation.Notification,
          title: 'Generating image...',
        },
        async () => {
          const result = await ApiService.getInstance().generateImage({
            format: formatMap[selectedFormat.label],
            model: selectedModel?.description as ModelKey,
            text: prompt,
            waitForCompletion: true,
          });

          const action = await vscode.window.showInformationMessage(
            'Image generated successfully!',
            'Open in Browser',
            'Copy URL',
          );

          if (action === 'Open in Browser') {
            await vscode.env.openExternal(vscode.Uri.parse(result.url));
          } else if (action === 'Copy URL') {
            await vscode.env.clipboard.writeText(result.url);
            vscode.window.showInformationMessage(
              'Image URL copied to clipboard',
            );
          }
        },
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.generateContent', async () => {
      await executeRunAction('generate');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.postContent', async () => {
      await executeRunAction('post');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.publishContent', async () => {
      await vscode.commands.executeCommand('genfeed.postContent');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.showAnalytics', async () => {
      await executeRunAction('analytics');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.viewAnalytics', async () => {
      await vscode.commands.executeCommand('genfeed.showAnalytics');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.runFullLoop', async () => {
      await runFullLoopCommand();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.runComposite', async () => {
      await vscode.commands.executeCommand('genfeed.runFullLoop');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'genfeed.runStatus',
      async (runId?: string) => {
        await runStatusCommand(runId);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'genfeed.generateContentFromTemplate',
      async (template?: PromptTemplate) => {
        const authenticated = await requireAuth();
        if (!authenticated) {
          return;
        }

        let selectedTemplate = template;

        if (!selectedTemplate) {
          const templates =
            await ApiService.getInstance().getContentTemplates();
          if (!templates.length) {
            vscode.window.showWarningMessage('No templates available.');
            return;
          }

          const pickedTemplate = await vscode.window.showQuickPick(
            templates.map((item) => ({
              description: item.channel || item.category || 'general',
              detail: item.template,
              label: item.name,
              value: item,
            })),
            {
              placeHolder: 'Select a template',
            },
          );

          if (!pickedTemplate) {
            return;
          }

          selectedTemplate = pickedTemplate.value;
        }

        await executeRunAction('generate', {
          metadata: {
            source: 'ide.template',
            templateKey: selectedTemplate.key,
          },
          prefilledInput: selectedTemplate.template,
        });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.createCampaign', async () => {
      await createCampaignCommand();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'genfeed.exportRunArtifacts',
      async (providedRunId?: string) => {
        const runId =
          providedRunId ||
          (await vscode.window.showInputBox({
            placeHolder: 'Run ID',
            prompt: 'Export run artifacts',
          }));

        if (!runId) {
          return;
        }

        const run = await ApiService.getInstance().getRun(runId);
        const timeline = await safeLoadTimeline(runId);
        await writeArtifactsForRun(
          run,
          inferCampaignContextFromRun(run),
          timeline,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.toggleAgentMode', async () => {
      const config = vscode.workspace.getConfiguration('genfeed');
      const current = config.get<boolean>('agentMode', true);
      await config.update(
        'agentMode',
        !current,
        vscode.ConfigurationTarget.Workspace,
      );
      vscode.window.showInformationMessage(
        `Agent mode ${!current ? 'enabled' : 'disabled'} for this workspace.`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.authenticate', async () => {
      const authService = AuthService.getInstance();
      const success = await authService.authenticateWithDeviceFlow();
      if (success) {
        await refreshViews();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.signOut', async () => {
      await AuthService.getInstance().signOut();
      await refreshViews();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.setApiKey', async () => {
      const apiKey = await vscode.window.showInputBox({
        password: true,
        prompt: 'Enter your Genfeed.ai API key',
        validateInput: (value) => {
          if (!value?.trim()) {
            return 'API key cannot be empty';
          }
          if (value.length < 20) {
            return 'API key seems too short';
          }
          return null;
        },
      });

      if (!apiKey) {
        return;
      }

      const success = await AuthService.getInstance().setApiKey(apiKey);
      if (success) {
        await refreshViews();
      }
    }),
  );

  if (providers.presetsProvider) {
    context.subscriptions.push(
      vscode.commands.registerCommand('genfeed.openPresets', () => {
        vscode.commands.executeCommand('genfeed.presetsView.focus');
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('genfeed.refreshPresets', async () => {
        await providers.presetsProvider?.refreshPresets();
      }),
    );
  }

  if (providers.galleryProvider) {
    context.subscriptions.push(
      vscode.commands.registerCommand('genfeed.openGallery', () => {
        vscode.commands.executeCommand('genfeed.galleryView.focus');
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('genfeed.refreshGallery', async () => {
        await providers.galleryProvider?.refreshMedia();
      }),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.openRunQueue', async () => {
      await openGenfeedSidebar();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.openTemplates', async () => {
      await openGenfeedSidebar();
      await vscode.commands.executeCommand('genfeed.templatesView.focus');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.openAnalyticsView', async () => {
      await openGenfeedSidebar();
      await vscode.commands.executeCommand('genfeed.analyticsView.focus');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.toggleSidebar', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.toggleSidebarVisibility',
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.refreshRunQueue', async () => {
      await providers.runQueueProvider.refreshRuns();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('genfeed.refreshTemplates', async () => {
      await providers.templatesProvider.refreshTemplates();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'genfeed.refreshAnalyticsView',
      async () => {
        await providers.analyticsProvider.refreshAnalytics();
      },
    ),
  );
}

function inferCampaignContextFromRun(
  run: RunRecord,
): CampaignAuthoringContext | undefined {
  if (!run.input || typeof run.input !== 'object') {
    return undefined;
  }

  const input = run.input as Record<string, unknown>;
  const campaign = input.campaign;

  if (!campaign || typeof campaign !== 'object') {
    return undefined;
  }

  const campaignObject = campaign as Record<string, unknown>;
  if (
    typeof campaignObject.name !== 'string' ||
    typeof campaignObject.channel !== 'string'
  ) {
    return undefined;
  }

  const actionPrompt = RUN_PROMPTS[run.actionType];
  const actionInput = input[actionPrompt.targetKey];

  return {
    actionInput: typeof actionInput === 'string' ? actionInput : '',
    actionType: run.actionType,
    campaignName: campaignObject.name,
    channel: campaignObject.channel,
    objective:
      typeof campaignObject.objective === 'string'
        ? campaignObject.objective
        : undefined,
  };
}
