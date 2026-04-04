import type { Meta, StoryObj } from '@storybook/nextjs';
import OutputNode from '@ui/workflow-builder/nodes/OutputNode';

const meta: Meta<typeof OutputNode> = {
  argTypes: {
    id: { control: 'text' },
    isConnectable: { control: 'boolean' },
    selected: { control: 'boolean' },
  },
  component: OutputNode,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Nodes/OutputNode',
};

export default meta;
type Story = StoryObj<typeof OutputNode>;

export const Save: Story = {
  args: {
    data: {
      config: {},
      definition: {
        category: 'output',
        configSchema: {},
        description: 'Output media destination',
        icon: 'save',
        inputs: { media: { label: 'Media', type: 'any' } },
        label: 'Save',
        outputs: {},
      },
      inputVariableKeys: [],
      label: 'Save',
      nodeType: 'output-save',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  },
};
