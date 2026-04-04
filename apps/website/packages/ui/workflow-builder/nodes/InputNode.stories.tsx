import type { Meta, StoryObj } from '@storybook/nextjs';
import InputNode from '@ui/workflow-builder/nodes/InputNode';

const meta: Meta<typeof InputNode> = {
  argTypes: {
    id: {
      control: 'text',
      description: 'Unique identifier for the node',
    },
    isConnectable: {
      control: 'boolean',
      description: 'Whether the node can be connected to other nodes',
    },
    selected: {
      control: 'boolean',
      description: 'Whether the node is currently selected',
    },
  },
  component: InputNode,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Nodes/InputNode',
};

export default meta;
type Story = StoryObj<typeof InputNode>;

export const ImageInput: Story = {
  args: {
    data: {
      config: {},
      definition: {
        category: 'input',
        configSchema: {},
        description: 'Input image source',
        icon: 'image',
        inputs: {},
        label: 'Image Input',
        outputs: { image: { label: 'Image', type: 'image' } },
      },
      inputVariableKeys: [],
      label: 'Image Input',
      nodeType: 'input-image',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  },
};

export const VideoInput: Story = {
  args: {
    data: {
      config: {},
      definition: {
        category: 'input',
        configSchema: {},
        description: 'Input video source',
        icon: 'video',
        inputs: {},
        label: 'Video Input',
        outputs: { video: { label: 'Video', type: 'video' } },
      },
      inputVariableKeys: [],
      label: 'Video Input',
      nodeType: 'input-video',
    },
    id: 'node-2',
    isConnectable: true,
    selected: false,
  },
};

export const PromptInput: Story = {
  args: {
    data: {
      config: {},
      definition: {
        category: 'input',
        configSchema: {},
        description: 'Input prompt text',
        icon: 'text',
        inputs: {},
        label: 'Prompt Input',
        outputs: { prompt: { label: 'Prompt', type: 'text' } },
      },
      inputVariableKeys: [],
      label: 'Prompt Input',
      nodeType: 'input-prompt',
    },
    id: 'node-3',
    isConnectable: true,
    selected: false,
  },
};
