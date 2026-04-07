import type { Meta, StoryObj } from '@storybook/nextjs';
import ControlNode from '@ui/workflow-builder/nodes/ControlNode';

const meta: Meta<typeof ControlNode> = {
  argTypes: {
    id: { control: 'text' },
    isConnectable: { control: 'boolean' },
    selected: { control: 'boolean' },
  },
  component: ControlNode,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Nodes/ControlNode',
};

export default meta;
type Story = StoryObj<typeof ControlNode>;

export const Delay: Story = {
  args: {
    data: {
      config: { duration: 5000 },
      definition: {
        category: 'control',
        configSchema: {},
        description: 'Control flow with delay',
        icon: 'clock',
        inputs: {},
        label: 'Delay',
        outputs: {},
      },
      inputVariableKeys: [],
      label: 'Delay',
      nodeType: 'control-delay',
    },
    id: 'node-1',
    isConnectable: true,
    selected: false,
  },
};
