import type { Meta, StoryObj } from '@storybook/nextjs';
import VariablesPanel from '@ui/workflow-builder/panels/VariablesPanel';

const meta: Meta<typeof VariablesPanel> = {
  argTypes: {
    isCollapsed: {
      control: 'boolean',
      description: 'Whether the panel is collapsed',
    },
    onAdd: {
      action: 'variable-added',
      description: 'Callback when variable is added',
    },
    onDelete: {
      action: 'variable-deleted',
      description: 'Callback when variable is deleted',
    },
    onUpdate: {
      action: 'variable-updated',
      description: 'Callback when variable is updated',
    },
  },
  component: VariablesPanel,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Panels/VariablesPanel',
};

export default meta;
type Story = StoryObj<typeof VariablesPanel>;

export const Default: Story = {
  args: {
    isCollapsed: false,
    onAdd: () => {},
    onDelete: () => {},
    onToggleCollapse: () => {},
    onUpdate: () => {},
    variables: [
      {
        defaultValue: '',
        key: 'prompt',
        label: 'Prompt',
        required: true,
        type: 'text',
      },
      {
        defaultValue: '',
        key: 'image',
        label: 'Image',
        required: false,
        type: 'image',
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    isCollapsed: false,
    onAdd: () => {},
    onDelete: () => {},
    onToggleCollapse: () => {},
    onUpdate: () => {},
    variables: [],
  },
};

export const Collapsed: Story = {
  args: {
    isCollapsed: true,
    onAdd: () => {},
    onDelete: () => {},
    onToggleCollapse: () => {},
    onUpdate: () => {},
    variables: [
      {
        defaultValue: '',
        key: 'prompt',
        label: 'Prompt',
        required: true,
        type: 'text',
      },
    ],
  },
};
