'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { Task } from '@services/management/tasks.service';
import { Modal } from '@ui/modals/compound/modal.compound';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Textarea } from '@ui/primitives/textarea';
import { useWorkspaceTaskComposer } from './use-workspace-task-composer';
import { WorkspaceTaskBrandField } from './workspace-task-brand-field';
import {
  TASK_MODE_OPTIONS,
  TASK_PRESETS,
} from './workspace-task-composer.constants';
import { WorkspaceTaskFacecamPanel } from './workspace-task-facecam-panel';
import { WorkspaceTaskToolbar } from './workspace-task-toolbar';

interface WorkspaceTaskComposerProps {
  onOpenChange: (open: boolean) => void;
  onTaskCreated: (task: Task) => void;
  open: boolean;
}

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

  return (
    <Modal.Root open={open} onOpenChange={handleModalOpenChange}>
      <Modal.Content size="lg" className="border-white/10 bg-[#111111]">
        <Modal.Header>
          <Modal.Title>New Task</Modal.Title>
          <Modal.Description>
            Describe the outcome you want. Genfeed routes it automatically.
          </Modal.Description>
        </Modal.Header>

        <Modal.Body className="space-y-4">
          <WorkspaceTaskBrandField
            editor={taskTargetEditor}
            onClear={handleClearTargetBrand}
            selectedTargetBrandLabel={selectedTargetBrandLabel}
            taskTargetBrandId={taskTargetBrandId}
          />

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

          {taskMode !== 'standard' ? (
            <p className="text-xs text-foreground/35">
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

          {taskError ? (
            <p className="text-sm text-rose-300">{taskError}</p>
          ) : null}
        </Modal.Body>

        <Modal.Footer>
          <Checkbox
            isChecked={taskKeepOpen}
            label="Add another task"
            className="mr-auto text-xs text-foreground/50"
            onCheckedChange={handleKeepOpenChange}
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
            {taskBusy ? 'Creating…' : 'Create Task'}
            {!taskBusy && (
              <span className="ml-2 text-xs opacity-50">Cmd+Enter</span>
            )}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
