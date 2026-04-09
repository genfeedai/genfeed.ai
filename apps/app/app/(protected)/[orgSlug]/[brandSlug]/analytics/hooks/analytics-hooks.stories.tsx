import type { Meta, StoryObj } from '@storybook/nextjs';
import AnalyticsHooks from './analytics-hooks';

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
