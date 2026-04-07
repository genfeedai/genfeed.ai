'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { WorkflowToolbarProps } from '@props/automation/workflow-builder.props';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import {
  HiOutlineArrowDownTray,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineCloudArrowUp,
  HiOutlineListBullet,
  HiOutlinePlay,
} from 'react-icons/hi2';

export default function WorkflowToolbar({
  workflowId,
  workflowLabel,
  isDirty,
  isSaving,
  onSave,
  onValidate,
  onRun,
  onSchedule,
  onHistory,
  onExportComfyUI,
  hasComfyUITemplate = false,
  isReadOnly = false,
}: WorkflowToolbarProps) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-white/[0.08] bg-card px-4">
      {/* Left - Workflow Info */}
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-foreground">{workflowLabel}</h2>
        {isDirty && (
          <Badge variant="warning" size={ComponentSize.SM}>
            Unsaved
          </Badge>
        )}
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-2">
        {!isReadOnly && (
          <>
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={onValidate}
              ariaLabel="Validate workflow"
              icon={<HiOutlineCheck className="h-4 w-4" />}
              label="Validate"
            />
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={onSchedule}
              ariaLabel="Schedule workflow"
              icon={<HiOutlineClock className="h-4 w-4" />}
              label="Schedule"
            />
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={onHistory}
              ariaLabel="Execution history"
              icon={<HiOutlineListBullet className="h-4 w-4" />}
              label="History"
            />
            <Button
              type="button"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              onClick={onSave}
              isDisabled={isSaving || !isDirty}
              isLoading={isSaving}
              icon={
                !isSaving ? (
                  <HiOutlineCloudArrowUp className="h-4 w-4" />
                ) : undefined
              }
              label="Save"
            />
          </>
        )}
        {hasComfyUITemplate && onExportComfyUI && (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            onClick={onExportComfyUI}
            ariaLabel="Export ComfyUI template"
            icon={<HiOutlineArrowDownTray className="h-4 w-4" />}
            label="ComfyUI"
          />
        )}
        <Button
          type="button"
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          className="bg-success hover:bg-success/90"
          onClick={onRun}
          ariaLabel="Run workflow"
          icon={<HiOutlinePlay className="h-4 w-4" />}
          label="Run"
        />
      </div>
    </div>
  );
}
