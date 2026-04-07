import type { Meta, StoryObj } from '@storybook/nextjs';
import SchedulePanel from '@ui/workflow-builder/panels/SchedulePanel';

const meta: Meta<typeof SchedulePanel> = {
  argTypes: {
    isCollapsed: { control: 'boolean' },
    isEnabled: { control: 'boolean' },
    onScheduleUpdate: { action: 'schedule-updated' },
    onToggleCollapse: { action: 'collapse-toggled' },
  },
  component: SchedulePanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  title: 'Components/WorkflowBuilder/Panels/SchedulePanel',
};

export default meta;
type Story = StoryObj<typeof SchedulePanel>;

export const Default: Story = {
  args: {
    currentSchedule: undefined,
    currentTimezone: 'UTC',
    isCollapsed: false,
    isEnabled: false,
    onScheduleUpdate: () => {},
    onToggleCollapse: () => {},
    workflowId: 'workflow-1',
  },
};

export const WithSchedule: Story = {
  args: {
    currentSchedule: '0 9 * * *',
    currentTimezone: 'America/New_York',
    isCollapsed: false,
    isEnabled: true,
    onScheduleUpdate: () => {},
    onToggleCollapse: () => {},
    workflowId: 'workflow-2',
  },
};

export const Collapsed: Story = {
  args: {
    currentSchedule: '0 */6 * * *',
    currentTimezone: 'UTC',
    isCollapsed: true,
    isEnabled: true,
    onScheduleUpdate: () => {},
    onToggleCollapse: () => {},
    workflowId: 'workflow-3',
  },
};
