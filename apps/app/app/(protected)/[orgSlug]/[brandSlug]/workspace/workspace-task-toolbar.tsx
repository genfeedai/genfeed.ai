import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { WorkspaceTaskMode } from '@props/workspace/workspace-task-composer.props';
import type {
  TaskPreset,
  WorkspaceTaskToolbarProps,
} from '@props/workspace/workspace-task-toolbar.props';
import { Button } from '@ui/primitives/button';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  const translate = useTranslations(
    'pages.workspaceOverview.taskComposer.toolbar',
  );

  return (
    <PromptBarToolbar
      density="compact"
      leading={
        <>
          <PromptBarCompactSelect
            ariaLabel={translate('outputType')}
            density="compact"
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
            density="compact"
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
              className="px-2 text-xs text-foreground/55"
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
