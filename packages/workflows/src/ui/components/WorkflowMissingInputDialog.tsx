'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@genfeedai/ui/primitives/dialog';
import { Form } from '@genfeedai/ui/primitives/form';
import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo } from 'react';
import { useExecutionStore } from '../stores/execution';
import type { MissingInputRequest } from '../stores/execution/types';
import {
  useWorkflowInputForm,
  type WorkflowInputFieldDefinition,
  WorkflowInputFields,
} from './WorkflowInputFields';

function MissingInputForm({ request }: { request: MissingInputRequest }) {
  const translate = useTranslations('pages.workflows.missingInput');
  const submitMissingInputs = useExecutionStore((s) => s.submitMissingInputs);
  const dismissMissingInputs = useExecutionStore((s) => s.dismissMissingInputs);
  const fields = useMemo<WorkflowInputFieldDefinition[]>(
    () =>
      request.missingInputs.map((input) => ({
        description: input.description,
        key: input.name,
        label: input.label,
        required: true,
        type: input.type,
        validation: input.validation ? { ...input.validation } : undefined,
      })),
    [request],
  );
  const form = useWorkflowInputForm(fields);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const inputValues = form.submit();
    if (inputValues) {
      void submitMissingInputs(inputValues);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) dismissMissingInputs();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>

        <Form noValidate onSubmit={handleSubmit}>
          <DialogBody className="flex flex-col gap-4">
            <WorkflowInputFields
              errors={form.errors}
              fields={fields}
              idPrefix="workflow-missing-input"
              onValueChange={form.setFieldValue}
              values={form.values}
            />
          </DialogBody>

          <DialogFooter>
            <Button
              size={ButtonSize.SM}
              type="button"
              variant={ButtonVariant.SECONDARY}
              onClick={dismissMissingInputs}
            >
              {translate('cancel')}
            </Button>
            <Button
              size={ButtonSize.SM}
              type="submit"
              variant={ButtonVariant.DEFAULT}
            >
              {translate('submit')}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Asks for the inputs a run was refused for, then sends the same run again with
 * the values. Canceling drops the run without sending anything.
 */
export function WorkflowMissingInputDialog() {
  const request = useExecutionStore((s) => s.missingInputRequest);

  return request ? <MissingInputForm request={request} /> : null;
}
