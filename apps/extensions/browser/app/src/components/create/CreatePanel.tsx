import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AnalyticsSnapshot,
  buildRunIdempotencyKey,
  extractAnalyticsSnapshot,
  extractGeneratedPreview,
  extractPostResults,
  type PostResultEntry,
  summarizeRunHistory,
} from '~components/create/content-engine.utils';
import { TemplateCard } from '~components/create/TemplateCard';
import { authService } from '~services/auth.service';
import { ContentEngineService } from '~services/content-engine.service';
import {
  type RunActionType,
  type RunEventRecord,
  type RunRecord,
  RunsService,
} from '~services/runs.service';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { usePlatformStore } from '~store/use-platform-store';
import { useSettingsStore } from '~store/use-settings-store';

type ComposerActionType = 'INSERT_CONTENT' | 'INSERT_AND_PUBLISH_CONTENT';

type RunTemplateContext = {
  analyticsQuery: string;
  brandId: string | null;
  currentPlatform: string | null;
  generatePrompt: string;
  pageContext: { postAuthor?: string; postContent?: string; url?: string };
  previewContent: string;
  selectedCredentialId: string | null;
};

interface RunTemplate {
  actionType: RunActionType;
  description: string;
  id: string;
  label: string;
  buildInput: (context: RunTemplateContext) => Record<string, unknown>;
}

interface Credential {
  id: string;
  platform: string;
  externalHandle?: string;
  isConnected: boolean;
}

interface CreatePanelProps {
  onStartChat: () => void;
}

interface ChatTemplate {
  id: string;
  platform: string;
  label: string;
  description: string;
  systemPrompt: string;
}

const CHAT_TEMPLATES: ChatTemplate[] = [
  {
    description: 'Write an engaging tweet',
    id: 'twitter-post',
    label: 'Twitter Post',
    platform: 'twitter',
    systemPrompt:
      'Help me write an engaging tweet. Keep it under 280 characters, punchy and shareable.',
  },
  {
    description: 'Create a multi-tweet thread',
    id: 'twitter-thread',
    label: 'Twitter Thread',
    platform: 'twitter',
    systemPrompt:
      'Help me create a Twitter thread. Each tweet should be under 280 characters. Number them and make them flow naturally.',
  },
  {
    description: 'Professional LinkedIn update',
    id: 'linkedin-post',
    label: 'LinkedIn Post',
    platform: 'linkedin',
    systemPrompt:
      'Help me write a professional LinkedIn post. Use line breaks for readability, include a hook in the first line, and end with a call to action.',
  },
  {
    description: 'Caption with hashtags',
    id: 'instagram-caption',
    label: 'Instagram Caption',
    platform: 'instagram',
    systemPrompt:
      'Help me write an Instagram caption. Include relevant emojis, a call to action, and suggest 15-20 relevant hashtags at the end.',
  },
];

const RUN_TEMPLATES: RunTemplate[] = [
  {
    actionType: 'generate',
    buildInput: (context) => ({
      brandId: context.brandId,
      pageContext: context.pageContext,
      platform: context.currentPlatform,
      prompt:
        context.generatePrompt ||
        `Generate a polished social post for ${context.currentPlatform || 'social'} using this context: ${context.pageContext.postContent || context.pageContext.url || 'Current page'}`,
    }),
    description: 'Generate copy from the active page context.',
    id: 'generate-from-page',
    label: 'Generate From Page',
  },
  {
    actionType: 'post',
    buildInput: (context) => ({
      brandId: context.brandId,
      credentialId: context.selectedCredentialId,
      pageContext: context.pageContext,
      payload: context.previewContent,
      platform: context.currentPlatform,
    }),
    description: 'Publish current preview using connected credentials.',
    id: 'publish-preview',
    label: 'Publish Preview',
  },
  {
    actionType: 'analytics',
    buildInput: (context) => ({
      brandId: context.brandId,
      platform: context.currentPlatform,
      query:
        context.analyticsQuery || 'generated vs published content overview',
    }),
    description: 'Fetch generated/published KPI snapshot.',
    id: 'analytics-snapshot',
    label: 'Analytics Snapshot',
  },
  {
    actionType: 'composite',
    buildInput: (context) => ({
      brandId: context.brandId,
      brief: `Generate content for ${context.currentPlatform || 'social'}, publish it using connected account ${context.selectedCredentialId || 'default'}, and return analytics snapshot for generated/published KPIs. Seed prompt: ${context.generatePrompt || context.previewContent || context.pageContext.postContent || 'no prompt provided'}`,
      pageContext: context.pageContext,
      platform: context.currentPlatform,
    }),
    description: 'Run generate -> post -> analytics as a composite brief.',
    id: 'full-loop',
    label: 'Full Loop',
  },
];

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function upsertRun(history: RunRecord[], run: RunRecord): RunRecord[] {
  const runId = run._id || run.id;
  if (!runId) {
    return [run, ...history].slice(0, 24);
  }

  const next = [...history];
  const existingIndex = next.findIndex((item) => {
    const itemRunId = item._id || item.id;
    return itemRunId === runId;
  });

  if (existingIndex >= 0) {
    next[existingIndex] = run;
  } else {
    next.unshift(run);
  }

  return next.slice(0, 24);
}

function formatRunStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatSnapshotTime(value: string | null): string {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function CreatePanel({ onStartChat }: CreatePanelProps): ReactElement {
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const addMessage = useChatStore((s) => s.addMessage);
  const activeBrandId = useBrandStore((s) => s.activeBrandId);
  const brands = useBrandStore((s) => s.brands);
  const currentPlatform = usePlatformStore((s) => s.currentPlatform);
  const pageContext = usePlatformStore((s) => s.pageContext);
  const composeBoxAvailable = usePlatformStore((s) => s.composeBoxAvailable);
  const canSubmitFromComposer = usePlatformStore(
    (s) => s.canSubmitFromComposer,
  );
  const autoPost = useSettingsStore((s) => s.autoPost);

  const [generatePrompt, setGeneratePrompt] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [analyticsQuery, setAnalyticsQuery] = useState(
    'generated vs published performance overview',
  );
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState<
    string | null
  >(null);
  const [currentRun, setCurrentRun] = useState<RunRecord | null>(null);
  const [currentRunEvents, setCurrentRunEvents] = useState<RunEventRecord[]>(
    [],
  );
  const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
  const [postResults, setPostResults] = useState<PostResultEntry[]>([]);
  const [analyticsSnapshot, setAnalyticsSnapshot] =
    useState<AnalyticsSnapshot | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [composerFeedback, setComposerFeedback] = useState<string | null>(null);
  const [postToComposer, setPostToComposer] = useState(autoPost);

  const runAbortControllerRef = useRef<AbortController | null>(null);

  const activeBrand = useMemo(
    () => brands.find((brand) => brand.id === activeBrandId) || null,
    [activeBrandId, brands],
  );

  const historySummary = useMemo(
    () => summarizeRunHistory(runHistory),
    [runHistory],
  );

  const kpis = useMemo(() => {
    if (analyticsSnapshot) {
      return {
        ...analyticsSnapshot,
        failed: analyticsSnapshot.failed || historySummary.failedPosts,
        generated: analyticsSnapshot.generated || historySummary.generated,
        published: analyticsSnapshot.published || historySummary.published,
        publishSuccessRate:
          analyticsSnapshot.publishSuccessRate ||
          (historySummary.published + historySummary.failedPosts > 0
            ? (historySummary.published /
                (historySummary.published + historySummary.failedPosts)) *
              100
            : 0),
      };
    }

    return extractAnalyticsSnapshot({}, historySummary);
  }, [analyticsSnapshot, historySummary]);

  useEffect(() => {
    setPostToComposer(autoPost);
  }, [autoPost]);

  useEffect(() => {
    if (!activeBrandId) {
      setCredentials([]);
      setSelectedCredentialId(null);
      return;
    }

    chrome.runtime.sendMessage(
      { event: 'getCredentials', payload: { brandId: activeBrandId } },
      (response) => {
        if (response?.success && Array.isArray(response.credentials)) {
          const connected = (response.credentials as Credential[]).filter(
            (credential) => credential.isConnected,
          );
          setCredentials(connected);
          setSelectedCredentialId(connected[0]?.id ?? null);
        } else {
          setCredentials([]);
          setSelectedCredentialId(null);
        }
      },
    );
  }, [activeBrandId]);

  useEffect(
    () => () => {
      runAbortControllerRef.current?.abort();
    },
    [],
  );

  function handleSelectTemplate(template: ChatTemplate) {
    setActiveThread(null);
    clearMessages();
    addMessage({
      content: template.systemPrompt,
      createdAt: new Date().toISOString(),
      id: `system-${Date.now()}`,
      role: 'system',
      threadId: '',
    });
    onStartChat();
  }

  async function ensureRunContext(actionType: RunActionType): Promise<{
    authContext: NonNullable<
      Awaited<ReturnType<typeof authService.getAuthContext>>
    >;
    token: string;
  }> {
    const token = await authService.getToken();
    if (!token) {
      throw new Error('Sign in from the extension popup first.');
    }

    const authContext = await authService.getAuthContext(true);
    if (!authContext?.organization?.id) {
      throw new Error(
        'No organization context found. Open the web app and finish account setup.',
      );
    }

    if (
      (actionType === 'post' || actionType === 'analytics') &&
      !activeBrandId
    ) {
      throw new Error(
        'Select an active brand in Settings before running this action.',
      );
    }

    return {
      authContext,
      token,
    };
  }

  function relayComposer(actionType: ComposerActionType) {
    if (!previewContent.trim()) {
      setComposerFeedback('Add preview content before sending to composer.');
      return;
    }

    const actionLabel =
      actionType === 'INSERT_AND_PUBLISH_CONTENT' ? 'posted' : 'inserted';

    chrome.runtime.sendMessage(
      {
        event: 'RELAY_TO_CONTENT',
        payload: {
          content: previewContent,
          platform: currentPlatform,
          type: actionType,
        },
      },
      (response) => {
        if (response?.success) {
          setComposerFeedback(`Preview ${actionLabel} in active composer.`);
        } else {
          setComposerFeedback(
            response?.error ||
              'Failed to relay content to the active page composer.',
          );
        }
      },
    );
  }

  async function runAction(
    actionType: RunActionType,
    input: Record<string, unknown>,
    options: { idempotencyKey?: string; templateId?: string } = {},
  ) {
    const { token, authContext } = await ensureRunContext(actionType);

    runAbortControllerRef.current?.abort();
    runAbortControllerRef.current = new AbortController();

    setIsRunning(true);
    setRunError(null);
    setComposerFeedback(null);
    setCurrentRunEvents([]);

    const runsService = new RunsService(token);
    const contentEngine = new ContentEngineService(runsService);

    try {
      const snapshot = await contentEngine.executeRunLoop({
        actionType,
        correlationId: `extension:${actionType}:${Date.now()}`,
        idempotencyKey: options.idempotencyKey,
        input,
        metadata: {
          brandId: activeBrandId,
          organizationId: authContext.organization.id,
          platform: currentPlatform,
          source: 'extension.sidepanel.create-loop',
          templateId: options.templateId,
        },
        onUpdate: ({ run, events }) => {
          setCurrentRun(run);
          setCurrentRunEvents(events);
        },
        signal: runAbortControllerRef.current.signal,
      });

      const nextHistory = upsertRun(runHistory, snapshot.run);
      setRunHistory(nextHistory);

      if (snapshot.run.status === 'completed') {
        if (actionType === 'generate') {
          const generated = extractGeneratedPreview(snapshot.run.output);
          if (generated) {
            setPreviewContent(generated);
          }
        }

        if (actionType === 'post') {
          const entries = extractPostResults(snapshot.run.output);
          if (entries.length > 0) {
            setPostResults((previous) =>
              [...entries, ...previous].slice(0, 12),
            );
          } else {
            setPostResults((previous) => [
              {
                message: 'Post run completed.',
                platform: currentPlatform ?? undefined,
                status: 'unknown',
                timestamp: new Date().toISOString(),
              },
              ...previous,
            ]);
          }
        }

        if (actionType === 'analytics') {
          setAnalyticsSnapshot(
            extractAnalyticsSnapshot(
              snapshot.run.output,
              summarizeRunHistory(nextHistory),
            ),
          );
        }
      }

      if (snapshot.run.status === 'failed') {
        setRunError(
          snapshot.run.error || 'Run failed. Check event log for details.',
        );
      }
    } finally {
      setIsRunning(false);
    }
  }

  async function handleGenerateRun() {
    const prompt = generatePrompt.trim();
    if (!prompt) {
      setRunError('Generation prompt is required.');
      return;
    }

    try {
      await runAction('generate', {
        brandId: activeBrandId,
        pageContext,
        platform: currentPlatform,
        prompt,
      });
    } catch (error) {
      setRunError(
        error instanceof Error
          ? error.message
          : 'Failed to start generate run.',
      );
    }
  }

  async function handlePostRun() {
    const payload = previewContent.trim();
    if (!payload) {
      setRunError('Preview content is required before posting.');
      return;
    }

    const postInput = {
      brandId: activeBrandId,
      credentialId: selectedCredentialId,
      pageContext,
      payload,
      platform: currentPlatform,
    };

    try {
      await runAction('post', postInput, {
        idempotencyKey: buildRunIdempotencyKey(
          'post',
          postInput,
          activeBrandId,
        ),
      });

      if (postToComposer) {
        await relayComposer('INSERT_AND_PUBLISH_CONTENT');
      }
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : 'Failed to start post run.',
      );
    }
  }

  async function handleAnalyticsRun() {
    const query = analyticsQuery.trim();
    if (!query) {
      setRunError('Analytics query is required.');
      return;
    }

    try {
      await runAction('analytics', {
        brandId: activeBrandId,
        platform: currentPlatform,
        query,
      });
    } catch (error) {
      setRunError(
        error instanceof Error
          ? error.message
          : 'Failed to start analytics run.',
      );
    }
  }

  async function handleRunTemplate(template: RunTemplate) {
    const templateContext: RunTemplateContext = {
      analyticsQuery,
      brandId: activeBrandId,
      currentPlatform,
      generatePrompt,
      pageContext,
      previewContent,
      selectedCredentialId,
    };

    const input = template.buildInput(templateContext);

    if (template.actionType === 'post') {
      const payload = String(input.payload ?? '').trim();
      if (!payload) {
        setRunError('Template requires preview content before posting.');
        return;
      }
    }

    try {
      await runAction(template.actionType, input, {
        idempotencyKey:
          template.actionType === 'post' || template.actionType === 'composite'
            ? buildRunIdempotencyKey(template.actionType, input, activeBrandId)
            : undefined,
        templateId: template.id,
      });
    } catch (error) {
      setRunError(
        error instanceof Error
          ? error.message
          : `Failed to execute ${template.label} template.`,
      );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Content Engine
        </h2>
        <p className="text-xs text-muted-foreground">
          Generate, preview, post, and analyze from the side panel.
        </p>
      </div>

      <div className="space-y-4 p-3">
        <section className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Execution Context
            </p>
            <span className="text-[11px] text-muted-foreground">
              {activeBrand
                ? `Brand: ${activeBrand.label}`
                : 'No brand selected'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-border bg-background px-2 py-1.5 text-muted-foreground">
              Platform: {currentPlatform || 'Not detected'}
            </div>
            <div className="rounded border border-border bg-background px-2 py-1.5 text-muted-foreground">
              Composer: {composeBoxAvailable ? 'Ready' : 'Unavailable'}
            </div>
          </div>
        </section>

        {currentRun ? (
          <section className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active Run
                </p>
                <p className="text-sm text-foreground">
                  {currentRun._id || currentRun.id || 'unknown'}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  currentRun.status === 'completed'
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : currentRun.status === 'failed'
                      ? 'bg-destructive/15 text-destructive'
                      : 'bg-primary/15 text-primary'
                }`}
              >
                {formatRunStatus(currentRun.status)}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-border">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{
                  width: `${Math.max(2, Math.min(100, currentRun.progress || 0))}%`,
                }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Progress {formatPercent(currentRun.progress || 0)}
            </p>
            {currentRunEvents.length > 0 ? (
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded border border-border bg-background p-2">
                {currentRunEvents.slice(-5).map((event) => (
                  <div key={`${event.type}-${event.createdAt}`}>
                    <p className="text-[11px] text-foreground">
                      {event.message || event.type}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(event.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {runError ? (
          <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {runError}
          </div>
        ) : null}

        {composerFeedback ? (
          <div className="rounded border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
            {composerFeedback}
          </div>
        ) : null}

        <section className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Workflow Templates
          </p>
          <div className="grid grid-cols-2 gap-2">
            {RUN_TEMPLATES.map((template) => (
              <Button
                key={template.id}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                disabled={isRunning}
                onClick={() => handleRunTemplate(template)}
                className="rounded border border-border bg-background px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
              >
                <p className="text-xs font-medium text-foreground">
                  {template.label}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {template.description}
                </p>
              </Button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            1. Generate
          </p>
          <Textarea
            value={generatePrompt}
            onChange={(event) => setGeneratePrompt(event.target.value)}
            placeholder="Write a prompt for generated content..."
            className="min-h-20 w-full rounded border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <Button
            type="button"
            variant={ButtonVariant.DEFAULT}
            disabled={isRunning || !generatePrompt.trim()}
            onClick={handleGenerateRun}
            className="mt-2 w-full rounded text-xs"
          >
            {isRunning && currentRun?.actionType === 'generate'
              ? 'Running Generate...'
              : 'Run Generate'}
          </Button>
        </section>

        <section className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            2. Preview
          </p>
          <Textarea
            value={previewContent}
            onChange={(event) => setPreviewContent(event.target.value)}
            placeholder="Generated preview appears here..."
            className="min-h-24 w-full rounded border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={ButtonVariant.OUTLINE}
              disabled={!previewContent.trim() || !composeBoxAvailable}
              onClick={() => relayComposer('INSERT_CONTENT')}
              className="rounded px-2 py-2 text-xs font-medium"
            >
              Insert In Composer
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.OUTLINE}
              disabled={!previewContent.trim() || !canSubmitFromComposer}
              onClick={() => relayComposer('INSERT_AND_PUBLISH_CONTENT')}
              className="rounded px-2 py-2 text-xs font-medium"
            >
              Insert + Publish
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            3. Post
          </p>

          <Select
            value={selectedCredentialId ?? ''}
            onValueChange={(value) => setSelectedCredentialId(value || null)}
          >
            <SelectTrigger className="w-full rounded border border-border bg-background px-3 py-2 text-xs text-foreground">
              <SelectValue placeholder="Default connected account" />
            </SelectTrigger>
            <SelectContent>
              {credentials.map((credential) => (
                <SelectItem key={credential.id} value={credential.id}>
                  {credential.platform}
                  {credential.externalHandle
                    ? ` (@${credential.externalHandle})`
                    : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={postToComposer}
              onChange={(event) => setPostToComposer(event.target.checked)}
            />
            Also publish from current page composer after run completes
          </label>

          <Button
            type="button"
            variant={ButtonVariant.DEFAULT}
            disabled={isRunning || !previewContent.trim()}
            onClick={handlePostRun}
            className="mt-2 w-full rounded text-xs"
          >
            {isRunning && currentRun?.actionType === 'post'
              ? 'Running Post...'
              : 'Run Post'}
          </Button>

          {postResults.length > 0 ? (
            <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded border border-border bg-background p-2">
              {postResults.slice(0, 5).map((result) => (
                <div
                  key={
                    result.publishedUrl ||
                    result.timestamp ||
                    `${result.platform || 'platform'}-${result.status}`
                  }
                  className="text-[11px]"
                >
                  <p className="font-medium text-foreground">
                    {result.platform || 'platform'} · {result.status}
                  </p>
                  {result.publishedUrl ? (
                    <a
                      href={result.publishedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      {result.publishedUrl}
                    </a>
                  ) : null}
                  {result.message ? (
                    <p className="text-muted-foreground">{result.message}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            4. Analytics
          </p>
          <input
            value={analyticsQuery}
            onChange={(event) => setAnalyticsQuery(event.target.value)}
            placeholder="Analytics query"
            className="w-full rounded border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <Button
            type="button"
            variant={ButtonVariant.DEFAULT}
            disabled={isRunning || !analyticsQuery.trim()}
            onClick={handleAnalyticsRun}
            className="mt-2 w-full rounded text-xs"
          >
            {isRunning && currentRun?.actionType === 'analytics'
              ? 'Running Analytics...'
              : 'Run Analytics'}
          </Button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded border border-border bg-background p-2">
              <p className="text-[10px] text-muted-foreground">Generated</p>
              <p className="text-sm font-semibold text-foreground">
                {kpis.generated}
              </p>
            </div>
            <div className="rounded border border-border bg-background p-2">
              <p className="text-[10px] text-muted-foreground">Published</p>
              <p className="text-sm font-semibold text-foreground">
                {kpis.published}
              </p>
            </div>
            <div className="rounded border border-border bg-background p-2">
              <p className="text-[10px] text-muted-foreground">
                Publish Success
              </p>
              <p className="text-sm font-semibold text-foreground">
                {formatPercent(kpis.publishSuccessRate)}
              </p>
            </div>
            <div className="rounded border border-border bg-background p-2">
              <p className="text-[10px] text-muted-foreground">Last Snapshot</p>
              <p className="text-[11px] font-medium text-foreground">
                {formatSnapshotTime(kpis.lastSnapshotAt)}
              </p>
            </div>
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chat Templates
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CHAT_TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => handleSelectTemplate(template)}
              />
            ))}
          </div>
        </section>
      </div>

      {isRunning && currentRun && !TERMINAL_STATUSES.has(currentRun.status) ? (
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Processing {currentRun.actionType} run...
        </div>
      ) : null}
    </div>
  );
}
