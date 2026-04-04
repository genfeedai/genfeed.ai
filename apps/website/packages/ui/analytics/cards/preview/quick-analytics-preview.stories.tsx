import type { Meta, StoryObj } from '@storybook/nextjs';
import { QuickAnalyticsPreview } from '@ui/analytics/cards/preview/quick-analytics-preview';

const meta: Meta<typeof QuickAnalyticsPreview> = {
  argTypes: {},
  component: QuickAnalyticsPreview,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Analytics/QuickAnalyticsPreview',
};

export default meta;
type Story = StoryObj<typeof QuickAnalyticsPreview>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
