import type { Meta, StoryObj } from '@storybook/nextjs';
import PublicationAnalyticsDashboard from '@ui/analytics/post-dashboard/publication-analytics-dashboard';

const meta: Meta<typeof PublicationAnalyticsDashboard> = {
  argTypes: {},
  component: PublicationAnalyticsDashboard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Analytics/PublicationAnalyticsDashboard',
};

export default meta;
type Story = StoryObj<typeof PublicationAnalyticsDashboard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
