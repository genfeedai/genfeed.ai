import type { Meta, StoryObj } from '@storybook/nextjs';
import EffectsNode from '@ui/workflow-builder/nodes/EffectsNode';

const meta: Meta<typeof EffectsNode> = {
  argTypes: {
    id: { control: 'text' },
    isConnectable: { control: 'boolean' },
    selected: { control: 'boolean' },
  },
  component: EffectsNode,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Nodes/EffectsNode',
};

export default meta;
type Story = StoryObj<typeof EffectsNode>;

export const Filter: Story = {
  args: {
    data: {
      config: { filter: 'vintage' },
      definition: {
        category: 'effects',
        configSchema: {},
        description: 'Apply media effects',
        icon: 'sparkles',
        inputs: { media: { label: 'Media', type: 'any' } },
        label: 'Add Filter',
        outputs: { media: { label: 'Filtered Media', type: 'any' } },
      },
      inputVariableKeys: [],
      label: 'Add Filter',
      nodeType: 'effects-filter',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  },
};
