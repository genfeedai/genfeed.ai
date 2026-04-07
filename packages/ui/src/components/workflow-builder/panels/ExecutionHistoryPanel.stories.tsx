import type { Meta, StoryObj } from '@storybook/nextjs';
import ExecutionHistoryPanel from '@ui/workflow-builder/panels/ExecutionHistoryPanel';

const meta: Meta<typeof ExecutionHistoryPanel> = {
  argTypes: {
    isCollapsed: { control: 'boolean' },
    onToggleCollapse: { action: 'collapse-toggled' },
  },
  component: ExecutionHistoryPanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Panels/ExecutionHistoryPanel',
};

export default meta;
type Story = StoryObj<typeof ExecutionHistoryPanel>;

export const Default: Story = {
  args: {
    isCollapsed: false,
    onToggleCollapse: () => {},
    workflowId: 'workflow-1',
  },
};

export const Collapsed: Story = {
  args: {
    isCollapsed: true,
    onToggleCollapse: () => {},
    workflowId: 'workflow-2',
  },
};
