import type { Meta, StoryObj } from '@storybook/nextjs';
import { MetricCard } from '@ui/analytics/cards/metric/metric-card';

const meta: Meta<typeof MetricCard> = {
  argTypes: {},
  component: MetricCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Analytics/MetricCard',
};

export default meta;
type Story = StoryObj<typeof MetricCard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
