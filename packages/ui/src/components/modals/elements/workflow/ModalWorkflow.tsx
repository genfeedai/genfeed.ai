import { type WorkflowSchema, workflowSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { IWorkflow } from '@genfeedai/interfaces';
import type { ModalCrudProps } from '@genfeedai/props/modals/modal.props';
import { WorkflowsService } from '@genfeedai/services/automation/workflows.service';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { type ChangeEvent, useEffect, useState } from 'react';

const AVAILABLE_TASKS = [
  { label: 'Publish to Instagram', value: 'publish:instagram' },
  { label: 'Publish to TikTok', value: 'publish:tiktok' },
  { label: 'Publish to YouTube', value: 'publish:youtube' },
  { label: 'Enhance Video', value: 'video:enhance' },
  { label: 'Resize Video', value: 'video:resize' },
  { label: 'Transcode Video', value: 'video:transcode' },
  { label: 'Enhance Audio', value: 'audio:enhance' },
  { label: 'Generate Captions', value: 'caption:generate' },
  { label: 'Generate Thumbnail', value: 'thumbnail:generate' },
];

export default function ModalWorkflow({
  item,
  onConfirm,
  onClose,
}: ModalCrudProps<IWorkflow>) {
  const { form, formRef, isSubmitting, onSubmit, closeModal, handleDelete } =
    useCrudModal<IWorkflow, WorkflowSchema>({
      defaultValues: {
        description: '',
        key: '',
        label: '',
        status: 'draft',
        tasks: [],
        trigger: 'manual',
      },
      entity: item || null,
      modalId: ModalEnum.WORKFLOW,
      onClose,
      onConfirm,
      schema: workflowSchema,
      serviceFactory: (token) => WorkflowsService.getInstance(token),
    });

  const [selectedTasks, setSelectedTasks] = useState<string[]>(
    item?.tasks || [],
  );

  useEffect(() => {
    form.setValue('tasks', selectedTasks, { shouldValidate: true });
  }, [selectedTasks, form]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === 'key') {
      const formattedKey = value
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      form.setValue('key', formattedKey, { shouldValidate: true });
    } else {
      form.setValue(name as any, value, { shouldValidate: true });
    }
  };

  const handleTaskToggle = (taskValue: string) => {
    setSelectedTasks((prev) =>
      prev.includes(taskValue)
        ? prev.filter((t) => t !== taskValue)
        : [...prev, taskValue],
    );
  };

  const handleRemoveTask = (taskValue: string) => {
    setSelectedTasks((prev) => prev.filter((t) => t !== taskValue));
  };

  return (
    <Modal
      id={ModalEnum.WORKFLOW}
      title={item ? 'Edit Workflow' : 'Create Workflow'}
    >
      <form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <FormControl label="Label">
          <Input
            type="text"
            name="label"
            control={form.control}
            onChange={handleChange}
            placeholder="Enter workflow name"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Key">
          <Input
            type="text"
            name="key"
            control={form.control}
            onChange={handleChange}
            placeholder="workflow-key"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Description">
          <Textarea
            name="description"
            control={form.control}
            onChange={handleChange}
            placeholder="Describe what this workflow does"
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Trigger">
          <SelectField
            name="trigger"
            control={form.control}
            onChange={handleChange}
            isDisabled={isSubmitting}
          >
            <option value="manual">Manual</option>
            <option value="scheduled">Scheduled</option>
            <option value="on-video-complete">On Video Complete</option>
            <option value="on-image-complete">On Image Complete</option>
          </SelectField>
        </FormControl>

        <FormControl label="Tasks">
          <div className="space-y-2">
            <div className="border border-white/[0.08] p-4">
              <div className="text-sm text-foreground/60 mb-3">
                Available Tasks
              </div>
              <div className="grid grid-cols-1 gap-2">
                {AVAILABLE_TASKS.map((task) => (
                  <label
                    key={task.value}
                    className="flex items-center space-x-3 cursor-pointer hover:bg-background p-2"
                  >
                    <Checkbox
                      isChecked={selectedTasks.includes(task.value)}
                      onCheckedChange={() => handleTaskToggle(task.value)}
                      isDisabled={isSubmitting}
                    />
                    <span className="flex-1">{task.label}</span>
                    <span className="text-xs text-foreground/60 font-mono">
                      {task.value}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {selectedTasks.length > 0 && (
              <div className="border border-primary/20 p-4 bg-primary/5">
                <div className="text-sm text-foreground/60 mb-3">
                  Selected Tasks ({selectedTasks.length})
                </div>
                <div className="space-y-2">
                  {selectedTasks.map((taskValue, index) => {
                    const task = AVAILABLE_TASKS.find(
                      (t) => t.value === taskValue,
                    );
                    return (
                      <div
                        key={taskValue}
                        className="flex items-center justify-between p-2 bg-card"
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-foreground/60">
                            {index + 1}.
                          </span>
                          <span>{task?.label || taskValue}</span>
                        </div>

                        <Button
                          withWrapper={false}
                          variant={ButtonVariant.GHOST}
                          size={ButtonSize.XS}
                          onClick={() => handleRemoveTask(taskValue)}
                          isDisabled={isSubmitting}
                          ariaLabel={`Remove task ${task?.label || taskValue}`}
                        >
                          ✕
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </FormControl>

        <FormControl label="Status">
          <SelectField
            name="status"
            control={form.control}
            onChange={handleChange}
            isDisabled={isSubmitting}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>
        </FormControl>

        <ModalActions>
          {item && (
            <Button
              label="Delete"
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handleDelete ? () => handleDelete() : undefined}
              isLoading={isSubmitting}
            />
          )}
          <Button
            label="Cancel"
            variant={ButtonVariant.GHOST}
            onClick={() => closeModal(false)}
          />
          <Button
            type="submit"
            label={`${item ? 'Update' : 'Create'} Workflow`}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
