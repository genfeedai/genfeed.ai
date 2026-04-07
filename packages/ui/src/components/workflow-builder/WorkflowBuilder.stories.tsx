import type { Meta, StoryObj } from '@storybook/nextjs';
import WorkflowBuilder from '@ui/workflow-builder/WorkflowBuilder';

const meta: Meta<typeof WorkflowBuilder> = {
  argTypes: {
    initialEdges: {
      control: 'object',
      description: 'Initial edges connecting nodes',
    },
    initialNodes: {
      control: 'object',
      description: 'Initial nodes to display on the canvas',
    },
    initialVariables: {
      control: 'object',
      description: 'Initial input variables for the workflow',
    },
    isReadOnly: {
      control: 'boolean',
      description: 'Whether the workflow is in read-only mode',
    },
    onSave: {
      action: 'saved',
      description: 'Callback when workflow is saved',
    },
    workflowId: {
      control: 'text',
      description: 'Unique identifier for the workflow',
    },
  },
  component: WorkflowBuilder,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/WorkflowBuilder',
};

export default meta;
type Story = StoryObj<typeof WorkflowBuilder>;

export const Default: Story = {
  args: {
    initialEdges: [],
    initialNodes: [],
    initialVariables: [],
    isReadOnly: false,
    workflowId: 'workflow-1',
  },
};

export const WithInitialNodes: Story = {
  args: {
    initialEdges: [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
      },
    ],
    initialNodes: [
      {
        data: {
          config: {},
          inputVariableKeys: [],
          label: 'Image Input',
          nodeType: 'input-image',
        },
        id: 'node-1',
        position: { x: 100, y: 100 },
        type: 'input-node',
      },
      {
        data: {
          config: { aspectRatio: '16:9' },
          inputVariableKeys: [],
          label: 'Resize',
          nodeType: 'process-resize',
        },
        id: 'node-2',
        position: { x: 300, y: 100 },
        type: 'process-node',
      },
    ],
    initialVariables: [
      {
        defaultValue: '',
        key: 'prompt',
        label: 'Prompt',
        required: true,
        type: 'text',
      },
    ],
    isReadOnly: false,
    workflowId: 'workflow-2',
  },
};

export const ReadOnly: Story = {
  args: {
    initialEdges: [],
    initialNodes: [
      {
        data: {
          config: {},
          inputVariableKeys: [],
          label: 'Image Input',
          nodeType: 'input-image',
        },
        id: 'node-1',
        position: { x: 100, y: 100 },
        type: 'input-node',
      },
    ],
    initialVariables: [],
    isReadOnly: true,
    workflowId: 'workflow-3',
  },
};
