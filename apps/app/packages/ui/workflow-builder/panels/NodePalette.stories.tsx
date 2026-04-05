import type { NodesByCategory } from '@genfeedai/interfaces/automation/workflow-builder.interface';
import type { Meta, StoryObj } from '@storybook/nextjs';
import NodePalette from '@ui/workflow-builder/panels/NodePalette';

const meta: Meta<typeof NodePalette> = {
  argTypes: {
    isCollapsed: {
      control: 'boolean',
      description: 'Whether the palette is collapsed',
    },
    onDragStart: {
      action: 'drag-started',
      description: 'Callback when node drag starts',
    },
    onToggleCollapse: {
      action: 'collapse-toggled',
      description: 'Callback to toggle collapse',
    },
  },
  component: NodePalette,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Panels/NodePalette',
};

export default meta;
type Story = StoryObj<typeof NodePalette>;

const mockNodesByCategory: NodesByCategory = {
  ai: [
    {
      category: 'ai',
      configSchema: {},
      description: 'Generate image',
      icon: 'sparkles',
      inputs: { prompt: { label: 'Prompt', type: 'text' } },
      label: 'Generate Image',
      outputs: { image: { label: 'Image', type: 'image' } },
    },
  ],
  control: [],
  effects: [],
  input: [
    {
      category: 'input',
      configSchema: {},
      description: 'Image input',
      icon: 'image',
      inputs: {},
      label: 'Image Input',
      outputs: { image: { label: 'Image', type: 'image' } },
    },
    {
      category: 'input',
      configSchema: {},
      description: 'Video input',
      icon: 'video',
      inputs: {},
      label: 'Video Input',
      outputs: { video: { label: 'Video', type: 'video' } },
    },
  ],
  output: [],
  processing: [
    {
      category: 'processing',
      configSchema: {},
      description: 'Resize media',
      icon: 'resize',
      inputs: { media: { label: 'Media', type: 'any' } },
      label: 'Resize',
      outputs: { media: { label: 'Resized', type: 'any' } },
    },
    {
      category: 'processing',
      configSchema: {},
      description: 'Caption media',
      icon: 'text',
      inputs: { media: { label: 'Media', type: 'any' } },
      label: 'Caption',
      outputs: { media: { label: 'With Caption', type: 'any' } },
    },
  ],
};

export const Default: Story = {
  args: {
    isCollapsed: false,
    nodesByCategory: mockNodesByCategory,
    onDragStart: () => {},
    onToggleCollapse: () => {},
  },
};

export const Collapsed: Story = {
  args: {
    isCollapsed: true,
    nodesByCategory: mockNodesByCategory,
    onDragStart: () => {},
    onToggleCollapse: () => {},
  },
};
