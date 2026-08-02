import type { Meta, StoryObj } from '@storybook/nextjs';
import AnalyticsList from './analytics-list';

const meta: Meta<typeof AnalyticsList> = {
  argTypes: {},
  component: AnalyticsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Analytics/AnalyticsList',
};

export default meta;
type Story = StoryObj<typeof AnalyticsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
