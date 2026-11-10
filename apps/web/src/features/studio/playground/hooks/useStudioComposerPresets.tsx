'use client';

import { ModelCategory } from '@genfeedai/contracts';
import {
  resolveStudioSystemPresets,
  type StudioSystemPreset,
  studioSystemPresetId,
} from '@genfeedai/contracts/constants/studio-system-presets.constant';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { GenerationSetupValues } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type {
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { getModelCapabilityByKey } from '@genfeedai/helpers/model-capability.helper';
import type { PromptCommandContext } from '@genfeedai/props/prompt-bars/prompt-command.props';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { usePromptBarContext } from '@providers/promptbar/promptbar.context';
import { applyGenerationSetupPreset } from '@ui/dropdowns/generation-setup/generation-setup.store';
import { Bookmark, ImageIcon, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { useStudioComposerSetup } from '@/features/studio/playground/hooks/useStudioComposerSetup';
import { buildStudioPresetCommands } from '@/features/studio/playground/utils/studio-prompt-commands';
import type {
  PromptBarContextGroup,
  PromptBarContextItem,
} from '@/features/studio/props/prompt-bar-context-row.props';
import type { StudioPlaygroundComposerContextGroups } from '@/features/studio/props/studio-playground.props';

/** Built-in presets offered in the context row while the prompt is empty. */
const CONTEXT_PRESET_LIMIT = 3;

type ComposerSetup = ReturnType<typeof useStudioComposerSetup>;

interface UseStudioComposerPresetsParams {
  attachedAssets: readonly PromptBarAttachedAsset[];
  contextGroups: StudioPlaygroundComposerContextGroups | undefined;
  isAutoMode: boolean;
  onPromptChange: (value: string) => void;
  onPromptCommandContextChange:
    | ((context: PromptCommandContext | null) => void)
    | undefined;
  prompt: string;
  selectedModel: IModel | undefined;
  settings: StudioPlaygroundSettings;
  composerSetup: Pick<
    ComposerSetup,
    | 'defaults'
    | 'handleApplyPreset'
    | 'handleClearPreset'
    | 'presets'
    | 'scope'
    | 'setup'
  >;
  type: StudioPlaygroundType;
}

/**
 * Built-in presets and saved Looks: applying one, the `/` menu commands that
 * apply them, and the chips above the prompt (the pinned preset, suggested
 * presets, then page context).
 */
export function useStudioComposerPresets({
  attachedAssets,
  contextGroups,
  isAutoMode,
  onPromptChange,
  onPromptCommandContextChange,
  prompt,
  selectedModel,
  settings,
  composerSetup: {
    defaults,
    handleApplyPreset,
    handleClearPreset,
    presets,
    scope,
    setup,
  },
  type,
}: UseStudioComposerPresetsParams) {
  const translate = useTranslations('pages.studioPlayground');
  const translateSetup = useTranslations('agent.generationSetup');
  const { presets: presetCatalog } = usePromptBarContext();
  const systemPresets = useMemo(
    () => resolveStudioSystemPresets(presetCatalog, type),
    [presetCatalog, type],
  );

  const handleApplySystemPreset = useCallback(
    (preset: StudioSystemPreset, currentPrompt: string = prompt) => {
      const values: Partial<GenerationSetupValues> = {
        ...preset.values,
        type: preset.type,
      };
      if (preset.type === 'video' && !isAutoMode) {
        const model = getModelCapabilityByKey(settings.modelKey, selectedModel);
        if (model?.category === ModelCategory.VIDEO) {
          const durations = model.durations ?? [];
          if (durations.length && !durations.includes(values.duration ?? 0)) {
            values.duration = durations.includes(settings.duration ?? 0)
              ? settings.duration
              : durations.includes(model.defaultDuration ?? 0)
                ? model.defaultDuration
                : durations[0];
          } else if (model.hasDurationEditing === false) {
            if (model.defaultDuration !== undefined) {
              values.duration = model.defaultDuration;
            } else {
              delete values.duration;
            }
          }
        }
      }
      applyGenerationSetupPreset(
        scope,
        studioSystemPresetId(preset.key),
        values,
        defaults,
      );
      if (!currentPrompt.trim()) onPromptChange(preset.prompt);
    },
    [
      scope,
      defaults,
      prompt,
      onPromptChange,
      isAutoMode,
      settings.modelKey,
      settings.duration,
      selectedModel,
    ],
  );

  const systemPresetOptions = useMemo(
    () =>
      systemPresets.map((preset) => ({
        description: preset.description,
        id: studioSystemPresetId(preset.key),
        label: preset.label,
      })),
    [systemPresets],
  );

  const handleApplySystemPresetById = useCallback(
    (presetId: string) => {
      const preset = systemPresets.find(
        (candidate) => studioSystemPresetId(candidate.key) === presetId,
      );
      if (preset) handleApplySystemPreset(preset);
    },
    [handleApplySystemPreset, systemPresets],
  );

  // Presets and saved looks live in the `/` menu and in the row above the
  // prompt, not behind a toolbar button.
  const presetsLabel = translateSetup('presets');
  const savedLooksLabel = translate('composerContext.savedLooks');
  const presetCommands = useMemo(
    () =>
      buildStudioPresetCommands(systemPresets, presets, {
        presets: presetsLabel,
        savedLooks: savedLooksLabel,
      }),
    [systemPresets, presets, presetsLabel, savedLooksLabel],
  );
  const presetHandlersRef = useRef({
    applyLook: handleApplyPreset,
    applySystemPreset: handleApplySystemPreset,
  });
  presetHandlersRef.current = {
    applyLook: handleApplyPreset,
    applySystemPreset: handleApplySystemPreset,
  };
  useEffect(() => {
    if (!onPromptCommandContextChange) return;
    onPromptCommandContextChange({
      commands: presetCommands.commands,
      onSelect: (command, promptText) => {
        const target = presetCommands.targets.get(command.name);
        if (target?.systemPreset) {
          presetHandlersRef.current.applySystemPreset(
            target.systemPreset,
            promptText,
          );
        } else if (target?.look) {
          presetHandlersRef.current.applyLook(target.look);
        }
      },
    });
    return () => onPromptCommandContextChange(null);
  }, [onPromptCommandContextChange, presetCommands]);

  const pinnedPresetId = setup.presetId;
  const pinnedSystemPreset = systemPresets.find(
    (preset) => studioSystemPresetId(preset.key) === pinnedPresetId,
  );
  const pinnedLook = presets.find((look) => look.id === pinnedPresetId);
  const pinnedLabel = pinnedSystemPreset?.label ?? pinnedLook?.label;
  // Presets set the output (shape, length) and only fill an empty prompt, and
  // "More like" attaches a reference, so both stay useful once text is typed.
  // Attached references already answer "more like", so they hide the row.
  const isContextSuggestionVisible = attachedAssets.length === 0;
  const presetGroupItems: PromptBarContextItem[] = [
    ...(pinnedLabel
      ? [
          {
            icon: pinnedLook ? (
              <Bookmark className="size-3.5" />
            ) : pinnedSystemPreset?.type === 'video' ? (
              <Video className="size-3.5" />
            ) : (
              <ImageIcon className="size-3.5" />
            ),
            id: `pinned-${pinnedPresetId}`,
            isPressed: true,
            label: pinnedLabel,
            onRemove: handleClearPreset,
            onSelect: () => undefined,
            removeLabel: translateSetup('unpinPreset'),
          },
        ]
      : []),
    ...(isContextSuggestionVisible && !pinnedLabel
      ? systemPresets.slice(0, CONTEXT_PRESET_LIMIT).map((preset) => ({
          ariaLabel: translateSetup('applyPreset', { label: preset.label }),
          icon:
            preset.type === 'video' ? (
              <Video className="size-3.5" />
            ) : (
              <ImageIcon className="size-3.5" />
            ),
          id: preset.key,
          label: preset.label,
          onSelect: () => handleApplySystemPreset(preset),
        }))
      : []),
  ];
  const contextRowGroups: PromptBarContextGroup[] = contextGroups?.selection
    ? [contextGroups.selection]
    : [
        { id: 'presets', items: presetGroupItems },
        ...(isContextSuggestionVisible && contextGroups?.recent
          ? [contextGroups.recent]
          : []),
      ];

  return {
    contextRowGroups,
    handleApplySystemPresetById,
    systemPresetOptions,
  };
}
