import LeaderboardList from '@pages/marketplace/leaderboard/leaderboard-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof LeaderboardList> = {
  argTypes: {},
  component: LeaderboardList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/LeaderboardList',
};

export default meta;
type Story = StoryObj<typeof LeaderboardList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
