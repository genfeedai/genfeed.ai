import type { Meta, StoryObj } from '@storybook/nextjs';
import ProcessNode from '@ui/workflow-builder/nodes/ProcessNode';

const meta: Meta<typeof ProcessNode> = {
  argTypes: {
    id: { control: 'text', description: 'Unique identifier for the node' },
    isConnectable: {
      control: 'boolean',
      description: 'Whether the node can be connected',
    },
    selected: {
      control: 'boolean',
      description: 'Whether the node is currently selected',
    },
  },
  component: ProcessNode,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Nodes/ProcessNode',
};

export default meta;
type Story = StoryObj<typeof ProcessNode>;

export const Resize: Story = {
  args: {
    data: {
      config: { aspectRatio: '16:9' },
      definition: {
        category: 'processing',
        configSchema: {},
        description: 'Resize media',
        icon: 'resize',
        inputs: { media: { label: 'Media', type: 'any' } },
        label: 'Resize',
        outputs: { media: { label: 'Resized Media', type: 'any' } },
      },
      inputVariableKeys: [],
      label: 'Resize',
      nodeType: 'process-resize',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  },
};

export const Caption: Story = {
  args: {
    data: {
      config: { style: 'modern' },
      definition: {
        category: 'processing',
        configSchema: {},
        description: 'Apply captions to media',
        icon: 'caption',
        inputs: { media: { label: 'Media', type: 'any' } },
        label: 'Add Caption',
        outputs: { media: { label: 'Media with Caption', type: 'any' } },
      },
      inputVariableKeys: [],
      label: 'Add Caption',
      nodeType: 'process-caption',
    },
    id: 'node-2',
    isConnectable: true,
    selected: false,
  },
};
