import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useMemo, useState } from 'react';
import {
  type AnalyticsSnapshot,
  extractAnalyticsSnapshot,
  extractGeneratedPreview,
  extractPostResults,
  type PostResultEntry,
} from '~components/create/content-engine.utils';
import { TemplateCard } from '~components/create/TemplateCard';
import {
  AgentToolsService,
  type ExtensionToolAction,
} from '~services/agent-tools.service';
import { authService } from '~services/auth.service';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { usePlatformStore } from '~store/use-platform-store';

type ToolTemplateContext = {
  brandId: string | null;
  currentPlatform: string | null;
  generatePrompt: string;
  pageContext: { postAuthor?: string; postContent?: string; url?: string };
  previewContent: string;
};

interface ToolTemplate {
  actionType: ExtensionToolAction;
  description: string;
  id: string;
  label: string;
  buildInput: (context: ToolTemplateContext) => Record<string, unknown>;
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

const TOOL_TEMPLATES: ToolTemplate[] = [
  {
    actionType: 'generate',
    buildInput: (context) => ({
      ...(context.brandId ? { brandId: context.brandId } : {}),
      ...(normalizeToolPlatform(context.currentPlatform, true)
        ? { platform: normalizeToolPlatform(context.currentPlatform, true) }
        : {}),
      topic:
        context.generatePrompt ||
        `Generate a polished social post for ${context.currentPlatform || 'social'} using this context: ${context.pageContext.postContent || context.pageContext.url || 'Current page'}`,
      type: 'post',
    }),
    description: 'Generate copy from the active page context.',
    id: 'generate-from-page',
    label: 'Generate From Page',
  },
  {
    actionType: 'post',
    buildInput: (context) => ({
      content: context.previewContent,
      ...(normalizeToolPlatform(context.currentPlatform, false)
        ? { platform: normalizeToolPlatform(context.currentPlatform, false) }
        : {}),
    }),
    description: 'Save the current preview as a Genfeed post draft.',
    id: 'publish-preview',
    label: 'Create Post Draft',
  },
  {
    actionType: 'analytics',
    buildInput: () => ({}),
    description: 'Fetch generated/published KPI snapshot.',
    id: 'analytics-snapshot',
    label: 'Analytics Snapshot',
  },
];

const SOCIAL_PLATFORMS = new Set([
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'twitter',
  'youtube',
]);

function normalizeToolPlatform(
  platform: string | null,
  allowNewsletter: boolean,
): string | undefined {
  const normalized = platform === 'x' ? 'twitter' : platform;
  if (normalized && SOCIAL_PLATFORMS.has(normalized)) {
    return normalized;
  }
  if (allowNewsletter && (normalized === 'email' || normalized === 'blog')) {
    return 'newsletter';
  }
  return undefined;
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

function CreatePanelHeader(): ReactElement {
  return (
    <div className="border-b border-border px-4 py-3">
      <h2 className="text-sm font-semibold text-foreground">Content Engine</h2>
      <p className="text-xs text-muted-foreground">
        Generate, preview, post, and analyze from the side panel.
      </p>
    </div>
  );
}

function ExecutionContextSection({
  activeBrandLabel,
  canCompose,
  platform,
}: {
  activeBrandLabel?: string;
  canCompose: boolean;
  platform: string | null;
}): ReactElement {
  return (
    <section className="border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Execution Context
        </p>
        <span className="text-2xs text-muted-foreground">
          {activeBrandLabel
            ? `Brand: ${activeBrandLabel}`
            : 'No brand selected'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-border bg-background px-2 py-1.5 text-muted-foreground">
          Platform: {platform || 'Not detected'}
        </div>
        <div className="border border-border bg-background px-2 py-1.5 text-muted-foreground">
          Composer: {canCompose ? 'Ready' : 'Unavailable'}
        </div>
      </div>
    </section>
  );
}

function PanelNotice({
  tone,
  children,
}: {
  tone: 'error' | 'primary';
  children: string | null;
}): ReactElement | null {
  if (!children) {
    return null;
  }

  const className =
    tone === 'error'
      ? 'border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive'
      : 'border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary';

  return <div className={className}>{children}</div>;
}

function WorkflowTemplatesSection({
  isRunning,
  onExecuteTemplate,
}: {
  isRunning: boolean;
  onExecuteTemplate: (template: ToolTemplate) => void;
}): ReactElement {
  return (
    <section className="border border-border bg-card p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Workflow Templates
      </p>
      <div className="grid grid-cols-2 gap-2">
        {TOOL_TEMPLATES.map((template) => (
          <Button
            key={template.id}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            disabled={isRunning}
            onClick={() => onExecuteTemplate(template)}
            className="border border-border bg-background p-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
          >
            <p className="text-xs font-medium text-foreground">
              {template.label}
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {template.description}
            </p>
          </Button>
        ))}
      </div>
    </section>
  );
}

function GenerateSection({
  currentAction,
  generatePrompt,
  isRunning,
  onGenerate,
  onPromptChange,
}: {
  currentAction: ExtensionToolAction | null;
  generatePrompt: string;
  isRunning: boolean;
  onGenerate: () => void;
  onPromptChange: (value: string) => void;
}): ReactElement {
  return (
    <section className="border border-border bg-card p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        1. Generate
      </p>
      <Textarea
        value={generatePrompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder="Write a prompt for generated content…"
        className="min-h-20 w-full border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
      />
      <Button
        type="button"
        variant={ButtonVariant.DEFAULT}
        disabled={isRunning || !generatePrompt.trim()}
        onClick={onGenerate}
        className="mt-2 w-full text-xs"
      >
        {isRunning && currentAction === 'generate'
          ? 'Running Generate…'
          : 'Run Generate'}
      </Button>
    </section>
  );
}

function PreviewSection({
  canCompose,
  previewContent,
  onPreviewChange,
  onInsert,
}: {
  canCompose: boolean;
  previewContent: string;
  onPreviewChange: (value: string) => void;
  onInsert: () => void;
}): ReactElement {
  return (
    <section className="border border-border bg-card p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        2. Preview
      </p>
      <Textarea
        value={previewContent}
        onChange={(event) => onPreviewChange(event.target.value)}
        placeholder="Generated preview appears here…"
        className="min-h-24 w-full border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
      />
      <div className="mt-2">
        <Button
          type="button"
          variant={ButtonVariant.SECONDARY}
          disabled={!previewContent.trim() || !canCompose}
          onClick={onInsert}
          className="w-full p-2 text-xs font-medium"
        >
          Insert In Composer
        </Button>
      </div>
    </section>
  );
}

function PostSection({
  currentAction,
  isRunning,
  postResults,
  previewContent,
  onPost,
}: {
  currentAction: ExtensionToolAction | null;
  isRunning: boolean;
  postResults: PostResultEntry[];
  previewContent: string;
  onPost: () => void;
}): ReactElement {
  return (
    <section className="border border-border bg-card p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        3. Post Draft
      </p>

      <Button
        type="button"
        variant={ButtonVariant.DEFAULT}
        disabled={isRunning || !previewContent.trim()}
        onClick={onPost}
        className="mt-2 w-full text-xs"
      >
        {isRunning && currentAction === 'post'
          ? 'Creating Draft…'
          : 'Create Post Draft'}
      </Button>

      {postResults.length > 0 ? (
        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto border border-border bg-background p-2">
          {postResults.slice(0, 5).map((result) => (
            <div
              key={
                result.publishedUrl ||
                result.timestamp ||
                `${result.platform || 'platform'}-${result.status}`
              }
              className="text-2xs"
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
  );
}

function AnalyticsSection({
  currentAction,
  isRunning,
  kpis,
  onAnalytics,
}: {
  currentAction: ExtensionToolAction | null;
  isRunning: boolean;
  kpis: AnalyticsSnapshot;
  onAnalytics: () => void;
}): ReactElement {
  return (
    <section className="border border-border bg-card p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        4. Analytics
      </p>
      <Button
        type="button"
        variant={ButtonVariant.DEFAULT}
        disabled={isRunning}
        onClick={onAnalytics}
        className="mt-2 w-full text-xs"
      >
        {isRunning && currentAction === 'analytics'
          ? 'Running Analytics…'
          : 'Run Analytics'}
      </Button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="border border-border bg-background p-2">
          <p className="text-2xs text-muted-foreground">Generated</p>
          <p className="text-sm font-semibold text-foreground">
            {kpis.generated}
          </p>
        </div>
        <div className="border border-border bg-background p-2">
          <p className="text-2xs text-muted-foreground">Published</p>
          <p className="text-sm font-semibold text-foreground">
            {kpis.published}
          </p>
        </div>
        <div className="border border-border bg-background p-2">
          <p className="text-2xs text-muted-foreground">Publish Success</p>
          <p className="text-sm font-semibold text-foreground">
            {formatPercent(kpis.publishSuccessRate)}
          </p>
        </div>
        <div className="border border-border bg-background p-2">
          <p className="text-2xs text-muted-foreground">Last Snapshot</p>
          <p className="text-2xs font-medium text-foreground">
            {formatSnapshotTime(kpis.lastSnapshotAt)}
          </p>
        </div>
      </div>
    </section>
  );
}

function ChatTemplatesSection({
  onSelectTemplate,
}: {
  onSelectTemplate: (template: ChatTemplate) => void;
}): ReactElement {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Chat Templates
      </p>
      <div className="grid grid-cols-2 gap-2">
        {CHAT_TEMPLATES.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={() => onSelectTemplate(template)}
          />
        ))}
      </div>
    </section>
  );
}

function RunningFooter({
  currentAction,
  isRunning,
}: {
  currentAction: ExtensionToolAction | null;
  isRunning: boolean;
}): ReactElement | null {
  if (!isRunning || !currentAction) {
    return null;
  }

  return (
    <div className="border-t border-border px-3 py-2 text-2xs text-muted-foreground">
      Running {currentAction} workflow…
    </div>
  );
}

function useCreatePanelController(onStartChat: () => void) {
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const addMessage = useChatStore((s) => s.addMessage);
  const activeBrandId = useBrandStore((s) => s.activeBrandId);
  const brands = useBrandStore((s) => s.brands);
  const currentPlatform = usePlatformStore((s) => s.currentPlatform);
  const pageContext = usePlatformStore((s) => s.pageContext);
  const composeBoxAvailable = usePlatformStore((s) => s.composeBoxAvailable);

  const [generatePrompt, setGeneratePrompt] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [currentAction, setCurrentAction] =
    useState<ExtensionToolAction | null>(null);
  const [postResults, setPostResults] = useState<PostResultEntry[]>([]);
  const [analyticsSnapshot, setAnalyticsSnapshot] =
    useState<AnalyticsSnapshot | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [composerFeedback, setComposerFeedback] = useState<string | null>(null);

  const activeBrand = useMemo(
    () => brands.find((brand) => brand.id === activeBrandId) || null,
    [activeBrandId, brands],
  );

  const kpis = useMemo(
    () => analyticsSnapshot ?? extractAnalyticsSnapshot({}),
    [analyticsSnapshot],
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

  async function requireToolToken(): Promise<string> {
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

    return token;
  }

  function insertInComposer() {
    if (!previewContent.trim()) {
      setComposerFeedback('Add preview content before sending to composer.');
      return;
    }

    chrome.runtime.sendMessage(
      {
        event: 'RELAY_TO_CONTENT',
        payload: {
          content: previewContent,
          platform: currentPlatform,
          type: 'INSERT_CONTENT',
        },
      },
      (response) => {
        if (response?.success) {
          setComposerFeedback('Preview inserted in active composer.');
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
    actionType: ExtensionToolAction,
    parameters: Record<string, unknown>,
  ): Promise<void> {
    const token = await requireToolToken();

    setIsRunning(true);
    setCurrentAction(actionType);
    setActionError(null);
    setComposerFeedback(null);

    try {
      const result = await new AgentToolsService(token).execute(
        actionType,
        parameters,
      );
      if (!result.success) {
        throw new Error(result.error || `${actionType} workflow failed.`);
      }

      if (actionType === 'generate') {
        const generated = extractGeneratedPreview(result.data);
        if (generated) {
          setPreviewContent(generated);
        }
      }

      if (actionType === 'post') {
        const entries = extractPostResults(result.data);
        setPostResults((previous) =>
          entries.length > 0
            ? [...entries, ...previous].slice(0, 12)
            : [
                {
                  message: 'Post draft created.',
                  platform: currentPlatform ?? undefined,
                  status: 'unknown',
                  timestamp: new Date().toISOString(),
                },
                ...previous,
              ],
        );
      }

      if (actionType === 'analytics') {
        setAnalyticsSnapshot(extractAnalyticsSnapshot(result.data));
      }
    } finally {
      setIsRunning(false);
      setCurrentAction(null);
    }
  }

  async function handleGenerate() {
    const prompt = generatePrompt.trim();
    if (!prompt) {
      setActionError('Generation prompt is required.');
      return;
    }

    try {
      await runAction('generate', {
        ...(activeBrandId ? { brandId: activeBrandId } : {}),
        ...(normalizeToolPlatform(currentPlatform, true)
          ? { platform: normalizeToolPlatform(currentPlatform, true) }
          : {}),
        topic: prompt,
        type: 'post',
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Failed to execute generate workflow.',
      );
    }
  }

  async function handlePost() {
    const payload = previewContent.trim();
    if (!payload) {
      setActionError('Preview content is required before posting.');
      return;
    }

    const postInput = {
      content: payload,
      ...(normalizeToolPlatform(currentPlatform, false)
        ? { platform: normalizeToolPlatform(currentPlatform, false) }
        : {}),
    };

    try {
      await runAction('post', postInput);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Failed to execute post workflow.',
      );
    }
  }

  async function handleAnalytics() {
    try {
      await runAction('analytics', {});
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Failed to execute analytics workflow.',
      );
    }
  }

  async function handleExecuteTemplate(template: ToolTemplate) {
    const templateContext: ToolTemplateContext = {
      brandId: activeBrandId,
      currentPlatform,
      generatePrompt,
      pageContext,
      previewContent,
    };

    const input = template.buildInput(templateContext);

    if (template.actionType === 'post') {
      const payload = String(input.content ?? '').trim();
      if (!payload) {
        setActionError('Template requires preview content before posting.');
        return;
      }
    }

    try {
      await runAction(template.actionType, input);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : `Failed to execute ${template.label} template.`,
      );
    }
  }

  return {
    activeBrand,
    actionError,
    composeBoxAvailable,
    composerFeedback,
    currentAction,
    currentPlatform,
    generatePrompt,
    handleAnalytics,
    handleExecuteTemplate,
    handleGenerate,
    handlePost,
    handleSelectTemplate,
    isRunning,
    kpis,
    postResults,
    previewContent,
    insertInComposer,
    setGeneratePrompt,
    setPreviewContent,
  };
}

export function CreatePanel({ onStartChat }: CreatePanelProps): ReactElement {
  const {
    activeBrand,
    actionError,
    composeBoxAvailable,
    composerFeedback,
    currentAction,
    currentPlatform,
    generatePrompt,
    handleAnalytics,
    handleExecuteTemplate,
    handleGenerate,
    handlePost,
    handleSelectTemplate,
    isRunning,
    kpis,
    postResults,
    previewContent,
    insertInComposer,
    setGeneratePrompt,
    setPreviewContent,
  } = useCreatePanelController(onStartChat);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <CreatePanelHeader />

      <div className="space-y-4 p-3">
        <ExecutionContextSection
          activeBrandLabel={activeBrand?.label}
          canCompose={composeBoxAvailable}
          platform={currentPlatform}
        />
        <PanelNotice tone="error">{actionError}</PanelNotice>
        <PanelNotice tone="primary">{composerFeedback}</PanelNotice>
        <WorkflowTemplatesSection
          isRunning={isRunning}
          onExecuteTemplate={(template) => {
            void handleExecuteTemplate(template);
          }}
        />
        <GenerateSection
          currentAction={currentAction}
          generatePrompt={generatePrompt}
          isRunning={isRunning}
          onGenerate={() => {
            void handleGenerate();
          }}
          onPromptChange={setGeneratePrompt}
        />
        <PreviewSection
          canCompose={composeBoxAvailable}
          previewContent={previewContent}
          onPreviewChange={setPreviewContent}
          onInsert={insertInComposer}
        />
        <PostSection
          currentAction={currentAction}
          isRunning={isRunning}
          postResults={postResults}
          previewContent={previewContent}
          onPost={() => {
            void handlePost();
          }}
        />
        <AnalyticsSection
          currentAction={currentAction}
          isRunning={isRunning}
          kpis={kpis}
          onAnalytics={() => {
            void handleAnalytics();
          }}
        />
        <ChatTemplatesSection onSelectTemplate={handleSelectTemplate} />
      </div>

      <RunningFooter currentAction={currentAction} isRunning={isRunning} />
    </div>
  );
}
