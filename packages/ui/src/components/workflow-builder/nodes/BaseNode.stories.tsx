import type { Meta, StoryObj } from '@storybook/nextjs';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import {
  HiOutlineCog6Tooth,
  HiOutlinePhoto,
  HiOutlineSparkles,
} from 'react-icons/hi2';

const meta: Meta<typeof BaseNode> = {
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
  component: BaseNode,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Nodes/BaseNode',
};

export default meta;
type Story = StoryObj<typeof BaseNode>;

export const Default: Story = {
  args: {
    bgColor: 'bg-green-50',
    borderColor: 'border-green-500',
    data: {
      config: {},
      definition: {
        category: 'input',
        configSchema: {},
        description: 'Input image node',
        icon: 'image',
        inputs: {},
        label: 'Image Input',
        outputs: { image: { label: 'Image', type: 'image' } },
      },
      label: 'Image Input',
      nodeType: 'input-image',
    },
    icon: <HiOutlinePhoto />,
    id: 'node-1',
    isConnectable: true,
    selected: false,
  },
};

export const Selected: Story = {
  args: {
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-500',
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
      label: 'Resize',
      nodeType: 'process-resize',
    },
    icon: <HiOutlineCog6Tooth />,
    id: 'node-2',
    isConnectable: true,
    selected: true,
  },
};

export const WithConfig: Story = {
  args: {
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-500',
    data: {
      config: {
        brightness: 1.2,
        filter: 'vintage',
        intensity: 0.8,
      },
      definition: {
        category: 'effects',
        configSchema: {},
        description: 'Apply visual effects',
        icon: 'sparkles',
        inputs: { media: { label: 'Media', type: 'any' } },
        label: 'Add Effects',
        outputs: { media: { label: 'Enhanced Media', type: 'any' } },
      },
      label: 'Add Effects',
      nodeType: 'effects-add',
    },
    icon: <HiOutlineSparkles />,
    id: 'node-3',
    isConnectable: true,
    selected: false,
  },
};
