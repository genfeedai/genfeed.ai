import type { Meta, StoryObj } from '@storybook/nextjs';
import AnalyticsOrganizationsList from './analytics-organizations-list';

const meta: Meta<typeof AnalyticsOrganizationsList> = {
  argTypes: {},
  component: AnalyticsOrganizationsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/AnalyticsOrganizationsList',
};

export default meta;
type Story = StoryObj<typeof AnalyticsOrganizationsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
