'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  useWorkflowInputForm,
  WorkflowInputFields,
} from '@genfeedai/workflows/ui/components/WorkflowInputFields';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Form } from '@ui/primitives/form';
import Spinner from '@ui/primitives/spinner';
import { Play, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { WorkflowInputVariable } from '@/features/workflows/services/workflow-api';

interface WorkflowRunPanelProps {
  inputVariables: WorkflowInputVariable[];
  isRunning: boolean;
  onClose: () => void;
  onRun: (
    inputValues: Record<string, unknown>,
    options: { saveDefaults: boolean },
  ) => Promise<void> | void;
}

export function WorkflowRunPanel({
  inputVariables,
  isRunning,
  onClose,
  onRun,
}: WorkflowRunPanelProps) {
  const form = useWorkflowInputForm(inputVariables);
  const [saveDefaults, setSaveDefaults] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const inputValues = form.submit();
    if (!inputValues) {
      return;
    }

    await onRun(inputValues, { saveDefaults });
  };

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold">Run workflow</h2>
        <Button
          ariaLabel="Close"
          icon={<X className="size-4" />}
          onClick={onClose}
          size={ButtonSize.ICON}
          tooltip="Close"
          variant={ButtonVariant.GHOST}
        />
      </div>

      <Form
        noValidate
        spacing="none"
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={handleSubmit}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <WorkflowInputFields
            errors={form.errors}
            fields={inputVariables}
            idPrefix="workflow-run"
            onValueChange={form.setFieldValue}
            values={form.values}
          />
        </div>

        <div className="space-y-3 border-t border-border p-4">
          <Checkbox
            isChecked={saveDefaults}
            label={
              <span className="text-sm text-foreground">
                Save as defaults for scheduled runs
              </span>
            }
            onChange={(event) => setSaveDefaults(event.target.checked)}
          />
          <Button
            className="w-full"
            icon={
              isRunning ? (
                <Spinner className="size-4" />
              ) : (
                <Play className="size-4" />
              )
            }
            isLoading={isRunning}
            size={ButtonSize.SM}
            type="submit"
            variant={ButtonVariant.DEFAULT}
          >
            Run
          </Button>
        </div>
      </Form>
    </aside>
  );
}
