import { ButtonVariant } from '@genfeedai/contracts';
import type { WorkspaceTaskComposerProps } from '@props/workspace/workspace-task-composer.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { useTranslations } from 'next-intl';
import { useWorkspaceTaskComposer } from './use-workspace-task-composer';
import { WorkspaceTaskBrandField } from './workspace-task-brand-field';
import {
  TASK_MODE_OPTIONS,
  TASK_PRESETS,
} from './workspace-task-composer.constants';
import { WorkspaceTaskFacecamPanel } from './workspace-task-facecam-panel';
import { WorkspaceTaskToolbar } from './workspace-task-toolbar';

export function WorkspaceTaskComposer({
  onOpenChange,
  onTaskCreated,
  open,
}: WorkspaceTaskComposerProps) {
  const {
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
  } = useWorkspaceTaskComposer({ onOpenChange, onTaskCreated });

  const translate = useTranslations('common.taskComposer');

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent size="lg" className="border-border bg-secondary">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <WorkspaceTaskBrandField
            editor={taskTargetEditor}
            onClear={handleClearTargetBrand}
            selectedTargetBrandLabel={selectedTargetBrandLabel}
            taskTargetBrandId={taskTargetBrandId}
          />

          <PromptBarComposer
            data-testid="workspace-task-composer"
            density="compact"
            banner={
              taskError ? (
                <p
                  role="alert"
                  className="px-3.5 py-2 text-sm text-destructive"
                >
                  {taskError}
                </p>
              ) : undefined
            }
          >
            <PromptEditor
              ariaLabel={translate('requestLabel')}
              value={taskRequest}
              placeholder={translate('requestPlaceholder')}
              onValueChange={setTaskRequest}
              onSubmit={() => {
                if (!taskBusy) void handleCreateTask();
              }}
              className="min-h-32"
            />
            <WorkspaceTaskToolbar
              isEnhancementBusy={taskEnhancementBusy}
              hasPreviousRequest={previousTaskRequest !== null}
              hasRequest={taskRequest.trim().length > 0}
              modeOptions={TASK_MODE_OPTIONS}
              onEnhance={() => void handleEnhanceTaskRequest()}
              onOutputTypeChange={setTaskOutputType}
              onTaskModeChange={setTaskMode}
              onUndoEnhancement={handleUndoTaskEnhancement}
              outputType={taskOutputType}
              presets={TASK_PRESETS}
              taskMode={taskMode}
            />
          </PromptBarComposer>

          {taskMode !== 'standard' ? (
            <p className="text-xs text-muted-foreground">
              {
                TASK_MODE_OPTIONS.find((mode) => mode.id === taskMode)
                  ?.description
              }
            </p>
          ) : null}

          {taskOutputType === 'facecam' ? (
            <WorkspaceTaskFacecamPanel
              avatars={facecamAvatars}
              avatarId={facecamAvatarId}
              error={facecamError}
              isLoading={facecamLoading}
              isSaveAsDefault={facecamSaveAsDefault}
              onAvatarChange={setFacecamAvatarId}
              onSaveAsDefaultChange={setFacecamSaveAsDefault}
              onVoiceChange={handleVoiceChange}
              voiceId={facecamVoiceId}
              voices={facecamVoices}
            />
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Checkbox
            isChecked={taskKeepOpen}
            label={translate('keepOpen')}
            className="mr-auto text-xs text-foreground/50"
            onCheckedChange={handleKeepOpenChange}
          />
          <DialogClose asChild>
            <Button variant={ButtonVariant.SECONDARY} disabled={taskBusy}>
              {translate('cancel')}
            </Button>
          </DialogClose>
          <Button
            variant={ButtonVariant.DEFAULT}
            disabled={taskBusy}
            onClick={() => void handleCreateTask()}
          >
            {taskBusy ? translate('creating') : translate('create')}
            {!taskBusy && (
              <span className="ml-2 text-xs opacity-50">
                {translate('enterHint')}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
