import type { Meta, StoryObj } from '@storybook/nextjs';
import WorkflowToolbar from '@ui/workflow-builder/WorkflowToolbar';

const meta: Meta<typeof WorkflowToolbar> = {
  argTypes: {
    isDirty: {
      control: 'boolean',
      description: 'Whether the workflow has unsaved changes',
    },
    isReadOnly: {
      control: 'boolean',
      description: 'Whether the workflow is in read-only mode',
    },
    isSaving: {
      control: 'boolean',
      description: 'Whether the workflow is currently being saved',
    },
    onHistory: {
      action: 'history-opened',
      description: 'Callback when history button is clicked',
    },
    onRun: {
      action: 'run',
      description: 'Callback when run button is clicked',
    },
    onSave: {
      action: 'saved',
      description: 'Callback when save button is clicked',
    },
    onSchedule: {
      action: 'scheduled',
      description: 'Callback when schedule button is clicked',
    },
    onValidate: {
      action: 'validated',
      description: 'Callback when validate button is clicked',
    },
    workflowId: {
      control: 'text',
      description: 'Unique identifier for the workflow',
    },
    workflowLabel: {
      control: 'text',
      description: 'Display label for the workflow',
    },
  },
  component: WorkflowToolbar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/WorkflowToolbar',
};

export default meta;
type Story = StoryObj<typeof WorkflowToolbar>;

export const Default: Story = {
  args: {
    isDirty: false,
    isReadOnly: false,
    isSaving: false,
    onHistory: () => {},
    onRun: () => {},
    onSave: () => {},
    onSchedule: () => {},
    onValidate: () => {},
    workflowId: 'workflow-1',
    workflowLabel: 'My Workflow',
  },
};

export const WithUnsavedChanges: Story = {
  args: {
    isDirty: true,
    isReadOnly: false,
    isSaving: false,
    onHistory: () => {},
    onRun: () => {},
    onSave: () => {},
    onSchedule: () => {},
    onValidate: () => {},
    workflowId: 'workflow-2',
    workflowLabel: 'Unsaved Workflow',
  },
};

export const Saving: Story = {
  args: {
    isDirty: true,
    isReadOnly: false,
    isSaving: true,
    onHistory: () => {},
    onRun: () => {},
    onSave: () => {},
    onSchedule: () => {},
    onValidate: () => {},
    workflowId: 'workflow-3',
    workflowLabel: 'Saving Workflow',
  },
};

export const ReadOnly: Story = {
  args: {
    isDirty: false,
    isReadOnly: true,
    isSaving: false,
    onHistory: () => {},
    onRun: () => {},
    onSave: () => {},
    onSchedule: () => {},
    onValidate: () => {},
    workflowId: 'workflow-4',
    workflowLabel: 'Read-Only Workflow',
  },
};
