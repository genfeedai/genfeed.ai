'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  PromptCategory,
  SystemPromptKey,
} from '@genfeedai/enums';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useWebsocketPrompt } from '@hooks/utils/use-websocket-prompt/use-websocket-prompt';
import { Prompt } from '@models/content/prompt.model';
import { PromptsService } from '@services/content/prompts.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { VoiceCloneService } from '@services/ingredients/voice-clone.service';
import { type Task, TasksService } from '@services/management/tasks.service';
import { BrandsService } from '@services/social/brands.service';
import type { Editor, JSONContent } from '@tiptap/core';
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { Modal } from '@ui/modals/compound/Modal';
import { Button as BaseButton, Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { HiOutlineSparkles } from 'react-icons/hi2';
import tippy, { type Instance } from 'tippy.js';

type WorkspaceTaskMode = 'standard' | 'research' | 'trends';

interface WorkspaceBrandMentionItem {
  id: string;
  label: string;
}

interface WorkspaceBrandMentionListProps {
  command: (item: WorkspaceBrandMentionItem) => void;
  items: WorkspaceBrandMentionItem[];
}

interface WorkspaceBrandMentionMatch {
  id: string;
  label: string;
}

interface FacecamOption {
  id: string;
  label: string;
  preview?: string;
  provider?: string;
}

interface WorkspaceTaskComposerProps {
  onOpenChange: (open: boolean) => void;
  onTaskCreated: (task: Task) => void;
  open: boolean;
}

const TASK_PRESETS = [
  {
    label: 'Post',
    outputType: 'post' as const,
  },
  {
    label: 'Newsletter',
    outputType: 'newsletter' as const,
  },
  {
    label: 'Image',
    outputType: 'image' as const,
  },
  {
    label: 'Video',
    outputType: 'video' as const,
  },
  {
    label: 'Facecam',
    outputType: 'facecam' as const,
  },
  {
    label: 'Caption',
    outputType: 'caption' as const,
  },
  {
    label: 'Auto',
    outputType: 'ingredient' as const,
  },
];

const TASK_MODE_OPTIONS: Array<{
  description: string;
  id: WorkspaceTaskMode;
  label: string;
}> = [
  {
    description: 'Create the requested output directly.',
    id: 'standard',
    label: 'Standard',
  },
  {
    description:
      'Route the task as a research brief with findings and next steps.',
    id: 'research',
    label: 'Research',
  },
  {
    description:
      'Produce a trend-focused report with signals, angles, and recommendations.',
    id: 'trends',
    label: 'Trends',
  },
];

function getBrandDisplayLabel(brand?: {
  label?: string;
  name?: string | null;
}) {
  return brand?.label || brand?.name || 'Selected brand';
}

function extractBrandMentionMatch(
  node: JSONContent | null | undefined,
): WorkspaceBrandMentionMatch | null {
  if (!node) {
    return null;
  }

  if (node.type === 'mention' && node.attrs?.id) {
    return {
      id: String(node.attrs.id),
      label: String(node.attrs.label ?? node.attrs.id ?? '').trim() || 'Brand',
    };
  }

  for (const child of node.content ?? []) {
    const match = extractBrandMentionMatch(child);
    if (match) {
      return match;
    }
  }

  return null;
}

const WorkspaceBrandMentionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  WorkspaceBrandMentionListProps
>(function WorkspaceBrandMentionList({ command, items }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }

      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }

      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.12] bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
        No brands found
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.12] bg-popover shadow-lg">
      {items.map((item, index) => (
        <BaseButton
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          key={item.id}
          onClick={() => command(item)}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-popover-foreground hover:bg-accent/50',
          )}
        >
          <span className="font-medium">@{item.label}</span>
        </BaseButton>
      ))}
    </div>
  );
});

export function WorkspaceTaskComposer({
  onOpenChange,
  onTaskCreated,
  open,
}: WorkspaceTaskComposerProps) {
  const { getToken } = useAuth();
  const { brandId, brands, organizationId, selectedBrand } = useBrand();
  const [taskRequest, setTaskRequest] = useState('');
  const [taskOutputType, setTaskOutputType] =
    useState<(typeof TASK_PRESETS)[number]['outputType']>('ingredient');
  const [facecamAvatars, setFacecamAvatars] = useState<FacecamOption[]>([]);
  const [facecamVoices, setFacecamVoices] = useState<FacecamOption[]>([]);
  const [facecamAvatarId, setFacecamAvatarId] = useState<string>('');
  const [facecamVoiceId, setFacecamVoiceId] = useState<string>('');
  const [facecamVoiceProvider, setFacecamVoiceProvider] = useState<string>('');
  const [facecamLoading, setFacecamLoading] = useState(false);
  const [facecamError, setFacecamError] = useState<string | null>(null);
  const [facecamSaveAsDefault, setFacecamSaveAsDefault] = useState(false);
  const [taskMode, setTaskMode] = useState<WorkspaceTaskMode>('standard');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskEnhancementBusy, setTaskEnhancementBusy] = useState(false);
  const [taskKeepOpen, setTaskKeepOpen] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [previousTaskRequest, setPreviousTaskRequest] = useState<string | null>(
    null,
  );
  const [taskTargetBrandId, setTaskTargetBrandId] = useState<string | null>(
    null,
  );
  const [taskTargetBrandLabel, setTaskTargetBrandLabel] = useState<
    string | null
  >(null);

  useEffect(() => {
    const config = (
      selectedBrand as { agentConfig?: Record<string, unknown> } | undefined
    )?.agentConfig;
    if (!config) return;
    const storedAvatar = config.heygenAvatarId as string | undefined;
    const storedVoice = config.heygenVoiceId as string | undefined;
    if (storedAvatar && !facecamAvatarId) {
      setFacecamAvatarId(storedAvatar);
    }
    if (storedVoice && !facecamVoiceId) {
      setFacecamVoiceId(storedVoice);
    }
  }, [selectedBrand, facecamAvatarId, facecamVoiceId]);

  useEffect(() => {
    if (
      taskOutputType !== 'facecam' ||
      (facecamAvatars.length > 0 && facecamVoices.length > 0)
    ) {
      return;
    }

    const controller = new AbortController();
    setFacecamLoading(true);
    setFacecamError(null);

    const run = async () => {
      try {
        const token = await resolveClerkToken(getToken);
        if (!token) {
          setFacecamError('Authentication token unavailable.');
          return;
        }

        const apiEndpoint = EnvironmentService.apiEndpoint;
        const headers = { Authorization: `Bearer ${token}` };

        const [avatarsResponse, voicesResponse, clonedVoices] =
          await Promise.all([
            fetch(`${apiEndpoint}/heygen/avatars`, {
              headers,
              signal: controller.signal,
            }),
            fetch(`${apiEndpoint}/heygen/voices`, {
              headers,
              signal: controller.signal,
            }),
            VoiceCloneService.getInstance(token)
              .getClonedVoices()
              .catch(() => []),
          ]);

        if (controller.signal.aborted) return;

        if (!avatarsResponse.ok || !voicesResponse.ok) {
          const detail =
            !avatarsResponse.ok && avatarsResponse.status === 500
              ? 'HeyGen API key missing or invalid. Add one in Settings -> API Keys, or set HEYGEN_KEY for self-hosted.'
              : `Avatars: ${avatarsResponse.status}, Voices: ${voicesResponse.status}`;
          setFacecamError(detail);
          return;
        }

        const avatarsJson = (await avatarsResponse.json()) as {
          data?: {
            attributes?: {
              avatars?: Array<{
                avatarId: string;
                name: string;
                preview?: string | null;
              }>;
            };
          };
        };
        const voicesJson = (await voicesResponse.json()) as {
          data?: {
            attributes?: {
              voices?: Array<{ voiceId: string; name: string }>;
            };
          };
        };

        const avatars = (avatarsJson.data?.attributes?.avatars ?? []).map(
          (avatar): FacecamOption => ({
            id: avatar.avatarId,
            label: avatar.name,
            preview: avatar.preview ?? undefined,
            provider: 'heygen',
          }),
        );

        // Merge HeyGen catalog voices + org's cloned voices into one list
        const heygenVoices = (voicesJson.data?.attributes?.voices ?? []).map(
          (voice): FacecamOption => ({
            id: voice.voiceId,
            label: `[HeyGen] ${voice.name}`,
            provider: 'heygen',
          }),
        );
        const clonedOptions = (clonedVoices ?? []).map(
          (voice): FacecamOption => {
            const providerLabel =
              (voice as { provider?: string }).provider === 'genfeed-ai'
                ? 'Genfeed AI'
                : (voice as { provider?: string }).provider === 'elevenlabs'
                  ? 'ElevenLabs'
                  : ((voice as { provider?: string }).provider ?? 'Cloned');
            return {
              id: voice.id,
              label: `[${providerLabel}] ${voice.metadataLabel ?? 'Cloned Voice'}`,
              provider:
                (voice as { provider?: string }).provider ?? 'elevenlabs',
            };
          },
        );
        const voices = [...clonedOptions, ...heygenVoices];

        if (controller.signal.aborted) return;
        setFacecamAvatars(avatars);
        setFacecamVoices(voices);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load HeyGen avatars/voices.';
        setFacecamError(message);
      } finally {
        if (!controller.signal.aborted) {
          setFacecamLoading(false);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [taskOutputType, facecamAvatars.length, facecamVoices.length, getToken]);

  const availableBrandMentions = useMemo<WorkspaceBrandMentionItem[]>(
    () =>
      brands.map((brand) => ({
        id: brand.id,
        label: brand.label ?? 'Untitled brand',
      })),
    [brands],
  );
  const selectedTargetBrandLabel = useMemo(
    () => taskTargetBrandLabel || getBrandDisplayLabel(selectedBrand),
    [selectedBrand, taskTargetBrandLabel],
  );
  const effectiveTaskBrandId = taskTargetBrandId || brandId || undefined;
  const taskBrandSuggestion = useMemo(
    () => ({
      items: ({ query }: { query: string }) => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
          return availableBrandMentions;
        }

        return availableBrandMentions.filter((item) =>
          item.label.toLowerCase().includes(normalizedQuery),
        );
      },
      render: () => {
        let component: ReactRenderer;
        let popup: Instance[];

        return {
          onExit: () => {
            popup?.[0]?.destroy();
            component.destroy();
          },
          onKeyDown: (props: { event: KeyboardEvent }) => {
            if (props.event.key === 'Escape') {
              popup?.[0]?.hide();
              return true;
            }

            return (
              (
                component.ref as {
                  onKeyDown: (value: { event: KeyboardEvent }) => boolean;
                }
              )?.onKeyDown(props) ?? false
            );
          },
          onStart: (props: Record<string, unknown>) => {
            component = new ReactRenderer(WorkspaceBrandMentionList, {
              editor: props.editor as Editor,
              props,
            });
            popup = tippy('body', {
              appendTo: () => document.body,
              content: component.element,
              getReferenceClientRect: props.clientRect as () => DOMRect,
              interactive: true,
              placement: 'bottom-start',
              showOnCreate: true,
              trigger: 'manual',
            });
          },
          onUpdate: (props: Record<string, unknown>) => {
            component.updateProps(props);
            popup?.[0]?.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          },
        };
      },
    }),
    [availableBrandMentions],
  );
  const taskTargetEditor = useEditor({
    content: '',
    editorProps: {
      attributes: {
        'aria-label': 'Target brand',
        class:
          'prose prose-sm prose-invert max-w-none min-h-11 rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-sm text-foreground focus:outline-none',
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
      }),
      Placeholder.configure({
        placeholder: selectedBrand
          ? `Type @ to target a different brand. Defaults to ${getBrandDisplayLabel(selectedBrand)}.`
          : 'Type @ to target a brand.',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        renderText({ node }) {
          return `@${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: taskBrandSuggestion as unknown as Omit<
          SuggestionOptions<unknown, MentionNodeAttrs>,
          'editor'
        >,
      }).extend({
        addAttributes() {
          return {
            id: { default: null },
            label: { default: null },
          };
        },
      }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const match = extractBrandMentionMatch(editor.getJSON());
      setTaskTargetBrandId(match?.id ?? null);
      setTaskTargetBrandLabel(match?.label ?? null);
    },
  });
  const listenForEnhancedTaskRequest = useWebsocketPrompt<string>({
    errorMessage: 'Task enhancement failed. Please try again.',
    onError: () => {
      setTaskEnhancementBusy(false);
    },
    onSuccess: (result) => {
      setTaskRequest(result);
      setTaskEnhancementBusy(false);
    },
    onTimeout: () => {
      setTaskEnhancementBusy(false);
    },
    timeoutMessage: 'Task enhancement timed out. Please try again.',
  });

  const handleEnhanceTaskRequest = useCallback(async () => {
    const normalizedRequest = taskRequest.trim();

    if (!normalizedRequest) {
      setTaskError('Add a task request before enhancing it.');
      return;
    }

    if (!organizationId) {
      setTaskError('Organization context unavailable.');
      return;
    }

    setPreviousTaskRequest(taskRequest);
    setTaskEnhancementBusy(true);
    setTaskError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        setTaskError('Authentication token unavailable.');
        setTaskEnhancementBusy(false);
        return;
      }

      const service = PromptsService.getInstance(token);
      const prompt = await service.post(
        new Prompt({
          brand: effectiveTaskBrandId,
          category: PromptCategory.ARTICLE,
          isSkipEnhancement: false,
          organization: organizationId,
          original: normalizedRequest,
          systemPromptKey: SystemPromptKey.DEFAULT,
          useRAG: true,
        }),
      );

      listenForEnhancedTaskRequest(prompt.id);
    } catch (error) {
      setTaskError(
        error instanceof Error
          ? error.message
          : 'Failed to enhance the task request.',
      );
      setTaskEnhancementBusy(false);
    }
  }, [
    effectiveTaskBrandId,
    getToken,
    listenForEnhancedTaskRequest,
    organizationId,
    taskRequest,
  ]);

  const handleUndoTaskEnhancement = useCallback(() => {
    if (previousTaskRequest === null) {
      return;
    }

    setTaskRequest(previousTaskRequest);
    setPreviousTaskRequest(null);
    setTaskError(null);
  }, [previousTaskRequest]);

  const buildTaskSubmission = useCallback(() => {
    const normalizedRequest = taskRequest.trim();
    const targetLabel = selectedTargetBrandLabel;

    if (taskMode === 'research') {
      return {
        brand: effectiveTaskBrandId,
        outputType: 'ingredient' as const,
        request: `Research this request for ${targetLabel} and return a concise report with key findings, implications, and recommended next steps.\n\nFocus: ${normalizedRequest}`,
        title: `Research brief - ${targetLabel}`,
      };
    }

    if (taskMode === 'trends') {
      return {
        brand: effectiveTaskBrandId,
        outputType: 'ingredient' as const,
        request: `Analyze current trends relevant to ${targetLabel} and return a trend report with key signals, opportunities, content angles, and recommendations.\n\nFocus: ${normalizedRequest}`,
        title: `Trends report - ${targetLabel}`,
      };
    }

    const base = {
      brand: effectiveTaskBrandId,
      outputType: taskOutputType,
      request: normalizedRequest,
      title: normalizedRequest.slice(0, 80),
    };

    if (taskOutputType === 'facecam') {
      return {
        ...base,
        heygenAvatarId: facecamAvatarId || undefined,
        voiceId: facecamVoiceId || undefined,
        voiceProvider: facecamVoiceProvider || undefined,
      };
    }

    return base;
  }, [
    effectiveTaskBrandId,
    facecamAvatarId,
    facecamVoiceId,
    facecamVoiceProvider,
    selectedTargetBrandLabel,
    taskMode,
    taskOutputType,
    taskRequest,
  ]);

  const handleCreateTask = async () => {
    if (!taskRequest.trim()) {
      setTaskError('Describe what you want Genfeed to create.');
      return;
    }

    if (taskOutputType === 'facecam' && !facecamAvatarId && !facecamVoiceId) {
      setTaskError(
        'Select an avatar and voice, or configure brand identity defaults in Settings.',
      );
      return;
    }

    setTaskBusy(true);
    setTaskError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        setTaskError('Authentication token unavailable.');
        return;
      }

      const service = TasksService.getInstance(token);
      const submission = buildTaskSubmission();
      const createdTask = await service.createTask(submission);

      if (
        taskOutputType === 'facecam' &&
        facecamSaveAsDefault &&
        effectiveTaskBrandId &&
        (facecamAvatarId || facecamVoiceId)
      ) {
        try {
          const brandsService = BrandsService.getInstance(token);
          await brandsService.updateAgentConfig(effectiveTaskBrandId, {
            heygenAvatarId: facecamAvatarId || null,
            heygenVoiceId: facecamVoiceId || null,
          });
        } catch (brandError) {
          logger.error('Failed to persist brand voice defaults', brandError);
        }
      }

      onTaskCreated(createdTask);
      setTaskRequest('');
      setTaskMode('standard');
      setTaskError(null);
      setPreviousTaskRequest(null);
      taskTargetEditor?.commands.clearContent();
      setTaskTargetBrandId(null);
      setTaskTargetBrandLabel(null);
      if (!taskKeepOpen) {
        onOpenChange(false);
      }
    } catch (error) {
      setTaskError(
        error instanceof Error ? error.message : 'Failed to create task.',
      );
    } finally {
      setTaskBusy(false);
    }
  };

  return (
    <Modal.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setTaskError(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <Modal.Content size="lg" className="border-white/10 bg-[#111111]">
        <Modal.Header>
          <Modal.Title>New Task</Modal.Title>
          <Modal.Description>
            Describe the outcome you want. Genfeed routes it automatically.
          </Modal.Description>
        </Modal.Header>

        <Modal.Body className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-xs font-medium text-foreground/60">
                Target brand
              </label>
              {taskTargetBrandId ? (
                <Button
                  size={ButtonSize.XS}
                  variant={ButtonVariant.GHOST}
                  className="px-2 text-xs text-foreground/55"
                  onClick={() => {
                    taskTargetEditor?.commands.clearContent();
                    setTaskTargetBrandId(null);
                    setTaskTargetBrandLabel(null);
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            {taskTargetEditor ? (
              <EditorContent editor={taskTargetEditor} />
            ) : (
              <div className="min-h-9 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground/35">
                Type @ to target a brand.
              </div>
            )}
            <p className="text-xs text-foreground/35">
              Targeting{' '}
              <span className="font-medium text-foreground/55">
                {selectedTargetBrandLabel}
              </span>
              {taskTargetBrandId ? ' from this modal' : ' by default'}.
            </p>
          </div>

          <Textarea
            id="workspace-task-request"
            className="min-h-48 w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-foreground outline-none placeholder:text-foreground/35 focus:border-white/20"
            placeholder="Create three thumbnail directions for our next launch, then draft a caption."
            value={taskRequest}
            onChange={(event) => setTaskRequest(event.target.value)}
            onKeyDown={(event) => {
              if (
                (event.metaKey || event.ctrlKey) &&
                event.key === 'Enter' &&
                !taskBusy
              ) {
                event.preventDefault();
                void handleCreateTask();
              }
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            {TASK_PRESETS.map((preset) => (
              <Button
                key={preset.outputType}
                size={ButtonSize.XS}
                variant={
                  taskOutputType === preset.outputType
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                className="font-semibold uppercase tracking-[0.12em]"
                disabled={taskMode !== 'standard'}
                onClick={() => setTaskOutputType(preset.outputType)}
              >
                {preset.label}
              </Button>
            ))}
            <span className="h-4 w-px bg-white/10" />
            {TASK_MODE_OPTIONS.map((mode) => (
              <Button
                key={mode.id}
                size={ButtonSize.XS}
                variant={
                  taskMode === mode.id
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                className="font-semibold"
                onClick={() => setTaskMode(mode.id)}
              >
                {mode.label}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              {previousTaskRequest ? (
                <Button
                  size={ButtonSize.XS}
                  variant={ButtonVariant.GHOST}
                  className="px-2 text-xs text-foreground/55"
                  onClick={handleUndoTaskEnhancement}
                >
                  Undo
                </Button>
              ) : null}
              <Button
                size={ButtonSize.XS}
                variant={ButtonVariant.GHOST}
                className="px-2 text-xs text-foreground/70"
                disabled={taskEnhancementBusy || !taskRequest.trim()}
                onClick={() => void handleEnhanceTaskRequest()}
              >
                <HiOutlineSparkles className="h-3.5 w-3.5" />
                {taskEnhancementBusy ? 'Enhancing...' : 'Enhance - 1 credit'}
              </Button>
            </div>
          </div>

          {taskMode !== 'standard' ? (
            <p className="text-xs text-foreground/35">
              {
                TASK_MODE_OPTIONS.find((mode) => mode.id === taskMode)
                  ?.description
              }
            </p>
          ) : null}

          {taskOutputType === 'facecam' ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/55">
                  Facecam settings
                </p>
                {facecamLoading ? (
                  <span className="text-[11px] text-foreground/40">
                    Loading avatars & voices...
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="facecam-avatar"
                    className="text-[11px] text-foreground/55"
                  >
                    Avatar
                  </label>
                  <Select
                    value={facecamAvatarId}
                    onValueChange={(value) => setFacecamAvatarId(value)}
                    disabled={facecamLoading || facecamAvatars.length === 0}
                  >
                    <SelectTrigger id="facecam-avatar">
                      <SelectValue placeholder="Pick an avatar" />
                    </SelectTrigger>
                    <SelectContent>
                      {facecamAvatars.map((avatar) => (
                        <SelectItem key={avatar.id} value={avatar.id}>
                          {avatar.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="facecam-voice"
                    className="text-[11px] text-foreground/55"
                  >
                    Voice
                  </label>
                  <Select
                    value={facecamVoiceId}
                    onValueChange={(value) => {
                      setFacecamVoiceId(value);
                      const match = facecamVoices.find((v) => v.id === value);
                      setFacecamVoiceProvider(match?.provider ?? 'heygen');
                    }}
                    disabled={facecamLoading || facecamVoices.length === 0}
                  >
                    <SelectTrigger id="facecam-voice">
                      <SelectValue placeholder="Pick a voice" />
                    </SelectTrigger>
                    <SelectContent>
                      {facecamVoices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Checkbox
                isChecked={facecamSaveAsDefault}
                label="Save as brand default"
                className="text-xs text-foreground/55"
                onCheckedChange={(checked) =>
                  setFacecamSaveAsDefault(checked === true)
                }
              />

              {facecamError ? (
                <p className="text-[11px] text-rose-300">{facecamError}</p>
              ) : null}
            </div>
          ) : null}

          {taskError ? (
            <p className="text-sm text-rose-300">{taskError}</p>
          ) : null}
        </Modal.Body>

        <Modal.Footer>
          <Checkbox
            isChecked={taskKeepOpen}
            label="Add another task"
            className="mr-auto text-xs text-foreground/50"
            onCheckedChange={(checked) => setTaskKeepOpen(checked === true)}
          />
          <Modal.CloseButton asChild>
            <Button variant={ButtonVariant.SECONDARY} disabled={taskBusy}>
              Cancel
            </Button>
          </Modal.CloseButton>
          <Button
            variant={ButtonVariant.DEFAULT}
            disabled={taskBusy}
            onClick={() => void handleCreateTask()}
          >
            {taskBusy ? 'Creating...' : 'Create Task'}
            {!taskBusy && (
              <span className="ml-2 text-xs opacity-50">Cmd+Enter</span>
            )}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
