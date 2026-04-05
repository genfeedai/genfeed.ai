import type { Meta, StoryObj } from '@storybook/nextjs';
import { GrowthTrendsCard } from '@ui/analytics/cards/growth-trends/growth-trends-card';

const meta: Meta<typeof GrowthTrendsCard> = {
  argTypes: {},
  component: GrowthTrendsCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Analytics/GrowthTrendsCard',
};

export default meta;
type Story = StoryObj<typeof GrowthTrendsCard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
