import AnalyticsHooks from '@pages/analytics/hooks/analytics-hooks';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AnalyticsHooks> = {
  argTypes: {},
  component: AnalyticsHooks,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/AnalyticsHooks',
};

export default meta;
type Story = StoryObj<typeof AnalyticsHooks>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
