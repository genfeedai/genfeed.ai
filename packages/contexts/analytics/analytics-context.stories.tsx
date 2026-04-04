import AnalyticsContext from '@contexts/analytics/analytics-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AnalyticsContext> = {
  argTypes: {},
  component: AnalyticsContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Contexts/Analytics/AnalyticsContext',
};

export default meta;
type Story = StoryObj<typeof AnalyticsContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
