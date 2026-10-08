import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  PromptCategory,
  SystemPromptKey,
  VoiceProvider,
} from '@genfeedai/contracts';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type {
  FacecamOption,
  UseWorkspaceTaskComposerParams,
} from '@genfeedai/props/workspace/workspace-task-composer.props';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import {
  heyGenAvatarValue,
  heyGenDefaultVoice,
  heyGenVoiceValue,
} from '@helpers/voice/heygen-identity.helper';
import { useHeyGenCatalog } from '@hooks/data/integrations/use-heygen-catalog';
import { useWebsocketPrompt } from '@hooks/utils/use-websocket-prompt/use-websocket-prompt';
import { Prompt } from '@models/content/prompt.model';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';
import { VoiceCloneService } from '@services/ingredients/voice-clone.service';
import { TasksService } from '@services/management/tasks.service';
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

export function useWorkspaceTaskComposer({
  onOpenChange,
  onTaskCreated,
}: UseWorkspaceTaskComposerParams) {
  const { getToken } = useAuthIdentity();
  const { brandId, brands, organizationId, selectedBrand } = useBrand();
  const [taskRequest, setTaskRequest] = useState('');
  const [taskOutputType, setTaskOutputType] =
    useState<(typeof TASK_PRESETS)[number]['outputType']>('ingredient');
  const heygen = useHeyGenCatalog();
  const [clonedOptions, setClonedOptions] = useState<{
    organizationId: string;
    voices: FacecamOption[];
  } | null>(null);
  const facecamAvatars = useMemo<FacecamOption[]>(
    () =>
      heygen.avatars.map((avatar) => ({
        id: heyGenAvatarValue(avatar.avatarRef),
        label: `${avatar.name} (${avatar.avatarRef.ownership === 'public' ? 'Public preset' : 'Personal HeyGen'})${avatar.avatarRef.readiness.reason ? ` · ${avatar.avatarRef.readiness.reason}` : ''}`,
        preview: avatar.preview,
        provider: 'heygen',
        avatarRef: avatar.avatarRef,
        disabled: !avatar.avatarRef.readiness.usable,
      })),
    [heygen.avatars],
  );
  const facecamVoices = useMemo<FacecamOption[]>(
    () => [
      ...(clonedOptions?.organizationId === organizationId
        ? clonedOptions.voices
        : []),
      ...heygen.voices.map((voice) => ({
        id: heyGenVoiceValue(voice),
        label: `${voice.name} (HeyGen · ${voice.ownership})`,
        provider: 'heygen',
        voiceRef: heyGenDefaultVoice(voice),
      })),
    ],
    [clonedOptions, organizationId, heygen.voices],
  );
  const [facecamAvatarId, setFacecamAvatarId] = useState<string>('');
  const [facecamVoiceId, setFacecamVoiceId] = useState<string>('');
  const [facecamVoiceProvider, setFacecamVoiceProvider] = useState<string>('');
  const facecamLoading = heygen.isLoading;
  const facecamError = heygen.error;
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
    setFacecamAvatarId(
      selectedBrand?.agentConfig?.defaultAvatarRef
        ? heyGenAvatarValue(selectedBrand.agentConfig.defaultAvatarRef)
        : '',
    );
    const voice = selectedBrand?.agentConfig?.defaultVoiceRef;
    setFacecamVoiceId(
      voice?.provider === VoiceProvider.HEYGEN &&
        voice.externalVoiceId &&
        voice.ownership
        ? `heygen:${voice.ownership}:${voice.externalVoiceId}`
        : '',
    );
    setFacecamVoiceProvider(voice?.provider ?? '');
  }, [selectedBrand]);

  useEffect(() => {
    const controller = new AbortController();
    if (taskOutputType === 'facecam' && organizationId) {
      void (async () => {
        const token = await resolveAuthToken(getToken);
        if (!token || controller.signal.aborted) return;
        const voices =
          await VoiceCloneService.getInstance(token).getClonedVoices();
        if (!controller.signal.aborted)
          setClonedOptions({
            organizationId,
            voices: voices.map((voice) => ({
              id: voice.id,
              label: `[${voice.provider ?? 'Cloned'}] ${voice.metadataLabel ?? 'Cloned voice'}`,
              provider: voice.provider ?? VoiceProvider.ELEVENLABS,
            })),
          });
      })().catch(() => {});
    }
    return () => controller.abort();
  }, [getToken, organizationId, taskOutputType]);

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
          'prose prose-sm dark:prose-invert max-w-none min-h-11 rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm text-foreground focus:outline-none',
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
          brandId: effectiveTaskBrandId,
          category: PromptCategory.ARTICLE,
          isSkipEnhancement: false,
          organizationId,
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
        brandId: effectiveTaskBrandId,
        outputType: 'ingredient' as const,
        request: `Research this request for ${targetLabel} and return a concise report with key findings, implications, and recommended next steps.\n\nFocus: ${normalizedRequest}`,
        title: `Research brief - ${targetLabel}`,
      };
    }

    if (taskMode === 'trends') {
      return {
        brandId: effectiveTaskBrandId,
        outputType: 'ingredient' as const,
        request: `Analyze current trends relevant to ${targetLabel} and return a trend report with key signals, opportunities, content angles, and recommendations.\n\nFocus: ${normalizedRequest}`,
        title: `Trends report - ${targetLabel}`,
      };
    }

    const base = {
      brandId: effectiveTaskBrandId,
      outputType: taskOutputType,
      request: normalizedRequest,
      title: normalizedRequest.slice(0, 80),
    };

    if (taskOutputType === 'facecam') {
      return {
        ...base,
        avatarRef: facecamAvatars.find(
          (avatar) => avatar.id === facecamAvatarId,
        )?.avatarRef,
        voiceRef: facecamVoices.find((voice) => voice.id === facecamVoiceId)
          ?.voiceRef,
        voiceId: facecamVoices.find((voice) => voice.id === facecamVoiceId)
          ?.voiceRef
          ? undefined
          : facecamVoiceId || undefined,
        voiceProvider:
          facecamVoiceProvider || (facecamVoiceId ? 'heygen' : undefined),
      };
    }

    return base;
  }, [
    effectiveTaskBrandId,
    facecamAvatarId,
    facecamAvatars,
    facecamVoices,
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

    if (
      taskOutputType === 'facecam' &&
      ((facecamAvatarId &&
        !facecamAvatars.some(
          (avatar) => avatar.id === facecamAvatarId && !avatar.disabled,
        )) ||
        (facecamVoiceId &&
          !facecamVoices.some((voice) => voice.id === facecamVoiceId)))
    ) {
      setTaskError('Reselect an available avatar and voice.');
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
            ...(facecamAvatarId
              ? {
                  defaultAvatarRef: facecamAvatars.find(
                    (avatar) => avatar.id === facecamAvatarId,
                  )?.avatarRef,
                }
              : {}),
            ...(facecamVoiceId
              ? {
                  defaultVoiceRef: facecamVoices.find(
                    (voice) => voice.id === facecamVoiceId,
                  )?.voiceRef ?? {
                    source: 'cloned',
                    provider:
                      facecamVoiceProvider.toUpperCase() ===
                      VoiceProvider.HEYGEN
                        ? VoiceProvider.HEYGEN
                        : VoiceProvider.ELEVENLABS,
                    internalVoiceId: facecamVoiceId,
                  },
                }
              : {}),
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
