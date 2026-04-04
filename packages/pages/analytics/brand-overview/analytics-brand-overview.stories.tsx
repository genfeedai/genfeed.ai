import AnalyticsBrandOverview from '@pages/analytics/brand-overview/analytics-brand-overview';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AnalyticsBrandOverview> = {
  argTypes: {},
  component: AnalyticsBrandOverview,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/AnalyticsBrandOverview',
};

export default meta;
type Story = StoryObj<typeof AnalyticsBrandOverview>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
