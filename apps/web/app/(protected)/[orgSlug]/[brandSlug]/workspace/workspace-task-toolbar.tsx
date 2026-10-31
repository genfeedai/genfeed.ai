import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  TaskPreset,
  WorkspaceTaskToolbarProps,
} from '@/features/workspace/props/workspace-task-toolbar.props';
import type { WorkspaceTaskMode } from '@/props/workspace/workspace-task-composer.props';

export function WorkspaceTaskToolbar({
  isEnhancementBusy,
  hasPreviousRequest,
  hasRequest,
  modeOptions,
  onEnhance,
  onOutputTypeChange,
  onTaskModeChange,
  onUndoEnhancement,
  outputType,
  presets,
  taskMode,
}: WorkspaceTaskToolbarProps) {
  const translate = useTranslations('common.taskComposer.toolbar');

  return (
    <PromptBarToolbar
      leading={
        <>
          <PromptBarCompactSelect
            ariaLabel={translate('outputType')}
            isDisabled={taskMode !== 'standard'}
            options={presets.map((preset) => ({
              label: preset.label,
              value: preset.outputType,
            }))}
            value={outputType}
            onChange={(value) =>
              onOutputTypeChange(value as TaskPreset['outputType'])
            }
          />
          <PromptBarCompactSelect
            ariaLabel={translate('taskMode')}
            options={modeOptions.map((mode) => ({
              label: mode.label,
              value: mode.id,
            }))}
            value={taskMode}
            onChange={(value) => onTaskModeChange(value as WorkspaceTaskMode)}
          />
        </>
      }
      trailing={
        <>
          {hasPreviousRequest ? (
            <Button
              size={ButtonSize.XS}
              variant={ButtonVariant.GHOST}
              className="px-2 text-xs text-foreground/60"
              onClick={onUndoEnhancement}
            >
              {translate('undo')}
            </Button>
          ) : null}
          <Button
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
            className="px-2 text-xs text-foreground/70"
            disabled={isEnhancementBusy || !hasRequest}
            onClick={onEnhance}
          >
            <Sparkles className="size-3.5" />
            {isEnhancementBusy ? translate('enhancing') : translate('enhance')}
          </Button>
        </>
      }
    />
  );
}
