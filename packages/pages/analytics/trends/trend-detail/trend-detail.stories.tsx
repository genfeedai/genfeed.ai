import TrendDetail from '@pages/analytics/trends/trend-detail/trend-detail';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof TrendDetail> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
  component: TrendDetail,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/TrendDetail',
};

export default meta;
type Story = StoryObj<typeof TrendDetail>;

export const Default: Story = {
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
