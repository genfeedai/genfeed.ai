import AnalyticsPlatformDetail from '@pages/analytics/platform-detail/analytics-platform-detail';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AnalyticsPlatformDetail> = {
  argTypes: {},
  component: AnalyticsPlatformDetail,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/AnalyticsPlatformDetail',
};

export default meta;
type Story = StoryObj<typeof AnalyticsPlatformDetail>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
