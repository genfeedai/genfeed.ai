import AnalyticsBrandsList from '@pages/analytics/brands-list/analytics-brands-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AnalyticsBrandsList> = {
  argTypes: {},
  component: AnalyticsBrandsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/AnalyticsBrandsList',
};

export default meta;
type Story = StoryObj<typeof AnalyticsBrandsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
