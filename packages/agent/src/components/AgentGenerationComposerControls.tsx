import type {
  ConversationComposerGenerationMode,
  ConversationComposerGenerationSettings,
} from '@genfeedai/agent/models/conversation-composer.model';
import type {
  AgentApiService,
  GenerationModel,
} from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  DropdownDirection,
  ModelCategory,
  type RouterPriority,
} from '@genfeedai/enums';
import { resolveGenerationModelControls } from '@helpers/generation-controls.helper';
import {
  resolveOrgAllowlistedModels,
  shouldOfferAutoModel,
} from '@helpers/model-allowlist.helper';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import AspectRatioDropdown from '@ui/dropdowns/aspect-ratio/AspectRatioDropdown';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import {
  AUTO_MODEL_OPTION_VALUE,
  getAutoModelLabel,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

type AgentGenerationComposerControlsProps = {
  apiService?: AgentApiService;
  disabled?: boolean;
  mode: Exclude<ConversationComposerGenerationMode, 'auto'>;
  onChange: (settings: ConversationComposerGenerationSettings) => void;
  prioritize?: RouterPriority;
  settings: ConversationComposerGenerationSettings;
};

const FALLBACK_IMAGE_RATIOS = ['1:1', '4:5', '3:4', '16:9', '9:16'];
const FALLBACK_VIDEO_RATIOS = ['16:9', '9:16', '1:1'];

export function AgentGenerationComposerControls({
  apiService,
  disabled = false,
  mode,
  onChange,
  prioritize,
  settings,
}: AgentGenerationComposerControlsProps): ReactElement {
  const {
    organizationId,
    settings: organizationSettings,
    settingsLoading,
  } = useBrand();
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();
  const [models, setModels] = useState<GenerationModel[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(apiService));

  useEffect(() => {
    if (!apiService) {
      setModels([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    runAgentApiEffect(apiService.getModelsEffect(controller.signal))
      .then(setModels)
      .catch(() => {
        if (!controller.signal.aborted) setModels([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [apiService]);

  const category = mode === 'video' ? ModelCategory.VIDEO : ModelCategory.IMAGE;
  const filteredModels = useMemo(
    () =>
      resolveOrgAllowlistedModels(models, {
        enabledModelIds: organizationSettings?.enabledModelIds,
        isSettingsReady: !settingsLoading,
        organizationId,
      }).filter((model) => model.category === category),
    [
      category,
      models,
      organizationId,
      organizationSettings?.enabledModelIds,
      settingsLoading,
    ],
  );
  const selectedModel = useMemo(
    () => filteredModels.find((model) => model.key === settings.model) ?? null,
    [filteredModels, settings.model],
  );
  const controls = useMemo(
    () => resolveGenerationModelControls(selectedModel, mode),
    [mode, selectedModel],
  );
  const ratios =
    controls.availableAspectRatios.length > 0
      ? controls.availableAspectRatios
      : mode === 'video'
        ? FALLBACK_VIDEO_RATIOS
        : FALLBACK_IMAGE_RATIOS;
  const maxOutputs = Math.max(1, selectedModel?.maxOutputs ?? 4);
  const canUseAuto = shouldOfferAutoModel(filteredModels);
  const modelValues = settings.model
    ? [settings.model]
    : canUseAuto
      ? [AUTO_MODEL_OPTION_VALUE]
      : [];

  useEffect(() => {
    const firstRequiredModel = filteredModels[0];
    if (!isLoading && !canUseAuto && !settings.model && firstRequiredModel) {
      onChange({ ...settings, model: firstRequiredModel.key });
    }
  }, [canUseAuto, filteredModels, isLoading, onChange, settings]);

  return (
    <div
      aria-label={`${mode === 'video' ? 'Video' : 'Image'} generation options`}
      className="flex min-w-0 flex-wrap items-center gap-1"
      role="group"
    >
      <ModelSelectorPopover
        autoLabel={getAutoModelLabel(prioritize)}
        className="max-w-44 border-0 bg-transparent shadow-none hover:bg-hover"
        favoriteModelKeys={favoriteModelKeys}
        isDisabled={
          disabled || isLoading || (!canUseAuto && !filteredModels.length)
        }
        models={filteredModels}
        name="agent-generation-model"
        onChange={(_name, values) => {
          const value = values[0];
          const model =
            !value || value === AUTO_MODEL_OPTION_VALUE ? undefined : value;
          const nextModel =
            filteredModels.find((item) => item.key === model) ?? null;
          const nextControls = resolveGenerationModelControls(nextModel, mode);
          const nextRatios =
            nextControls.availableAspectRatios.length > 0
              ? nextControls.availableAspectRatios
              : mode === 'video'
                ? FALLBACK_VIDEO_RATIOS
                : FALLBACK_IMAGE_RATIOS;
          onChange({
            ...settings,
            aspectRatio: nextRatios.includes(settings.aspectRatio)
              ? settings.aspectRatio
              : (nextRatios[0] ?? settings.aspectRatio),
            ...(mode === 'video' && nextControls.showDuration
              ? {
                  duration: settings.duration ?? nextControls.defaultDuration,
                }
              : {}),
            ...(mode === 'image'
              ? {
                  outputs: Math.min(
                    settings.outputs ?? 1,
                    Math.max(1, nextModel?.maxOutputs ?? 4),
                  ),
                }
              : {}),
            model,
          });
        }}
        onFavoriteToggle={onFavoriteToggle}
        prioritize={prioritize}
        selectionMode="single"
        values={modelValues}
      />
      <AspectRatioDropdown
        className="border-0 bg-transparent shadow-none hover:bg-hover"
        direction={DropdownDirection.UP}
        isDisabled={disabled}
        name="agent-generation-aspect-ratio"
        onChange={(_name, value) =>
          onChange({ ...settings, aspectRatio: value })
        }
        ratios={ratios}
        value={settings.aspectRatio}
      />
      {mode === 'image' ? (
        <ButtonDropdown
          className="border-0 bg-transparent shadow-none hover:bg-hover"
          direction={DropdownDirection.UP}
          isDisabled={disabled}
          name="agent-generation-outputs"
          onChange={(_name, value) =>
            onChange({ ...settings, outputs: Number(value) })
          }
          options={Array.from({ length: maxOutputs }, (_, index) => ({
            label: `${index + 1}x`,
            value: String(index + 1),
          }))}
          tooltip="Number of outputs"
          value={String(settings.outputs ?? 1)}
        />
      ) : controls.showDuration ? (
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            onChange({ ...settings, duration: Number(value) })
          }
          value={String(settings.duration ?? controls.defaultDuration)}
        >
          <SelectTrigger
            aria-label="Video duration"
            className="h-8 w-24 border-0 bg-transparent shadow-none"
          >
            <SelectValue placeholder="Duration" />
          </SelectTrigger>
          <SelectContent side="top">
            {controls.durationOptions.map((seconds) => (
              <SelectItem key={seconds} value={String(seconds)}>
                {seconds}s
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
