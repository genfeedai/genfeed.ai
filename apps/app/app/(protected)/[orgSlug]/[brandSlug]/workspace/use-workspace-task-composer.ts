import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { PromptCategory, SystemPromptKey } from '@genfeedai/enums';
import { resolveAuthToken } from '@helpers/auth/clerk.helper';
import { useWebsocketPrompt } from '@hooks/utils/use-websocket-prompt/use-websocket-prompt';
import { Prompt } from '@models/content/prompt.model';
import { PromptsService } from '@services/content/prompts.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { VoiceCloneService } from '@services/ingredients/voice-clone.service';
import { type Task, TasksService } from '@services/management/tasks.service';
import { BrandsService } from '@services/social/brands.service';
import type { Editor } from '@tiptap/core';
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import tippy, { type Instance } from 'tippy.js';
import {
  type WorkspaceBrandMentionItem,
  WorkspaceBrandMentionList,
} from './workspace-task-brand-mention-list';
import type {
  TASK_PRESETS,
  WorkspaceTaskMode,
} from './workspace-task-composer.constants';
import {
  extractBrandMentionMatch,
  getBrandDisplayLabel,
} from './workspace-task-composer.helpers';

interface FacecamOption {
  id: string;
  label: string;
  preview?: string;
  provider?: string;
}

interface UseWorkspaceTaskComposerParams {
  onOpenChange: (open: boolean) => void;
  onTaskCreated: (task: Task) => void;
}

export function useWorkspaceTaskComposer({
  onOpenChange,
  onTaskCreated,
}: UseWorkspaceTaskComposerParams) {
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
        const token = await resolveAuthToken(getToken);
        if (!token) {
          setFacecamError('Authentication token unavailable.');
          return;
        }

        const apiEndpoint = EnvironmentService.apiEndpoint;
        const headers = { Authorization: `Bearer ${token}` };

        if (controller.signal.aborted) return;

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
      const token = await resolveAuthToken(getToken);
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
        voiceProvider:
          facecamVoiceProvider || (facecamVoiceId ? 'heygen' : undefined),
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
      const token = await resolveAuthToken(getToken);
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

  const handleModalOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTaskError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleClearTargetBrand = () => {
    taskTargetEditor?.commands.clearContent();
    setTaskTargetBrandId(null);
    setTaskTargetBrandLabel(null);
  };

  const handleVoiceChange = (voiceId: string, provider: string) => {
    setFacecamVoiceId(voiceId);
    setFacecamVoiceProvider(provider);
  };

  const handleKeepOpenChange = (checked: boolean | 'indeterminate') => {
    setTaskKeepOpen(checked === true);
  };

  return {
    // state
    facecamAvatarId,
    facecamAvatars,
    facecamError,
    facecamLoading,
    facecamSaveAsDefault,
    facecamVoiceId,
    facecamVoices,
    previousTaskRequest,
    selectedTargetBrandLabel,
    taskBusy,
    taskEnhancementBusy,
    taskError,
    taskKeepOpen,
    taskMode,
    taskOutputType,
    taskRequest,
    taskTargetBrandId,
    taskTargetEditor,
    // handlers
    handleClearTargetBrand,
    handleCreateTask,
    handleEnhanceTaskRequest,
    handleKeepOpenChange,
    handleModalOpenChange,
    handleUndoTaskEnhancement,
    handleVoiceChange,
    setFacecamAvatarId,
    setFacecamSaveAsDefault,
    setTaskMode,
    setTaskOutputType,
    setTaskRequest,
  };
}
