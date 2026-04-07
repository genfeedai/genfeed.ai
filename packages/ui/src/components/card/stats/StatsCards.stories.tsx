import type { Meta, StoryObj } from '@storybook/nextjs';
import StatsCards from '@ui/card/stats/StatsCards';

const meta: Meta<typeof StatsCards> = {
  argTypes: {},
  component: StatsCards,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Ui/StatsCards',
};

export default meta;
type Story = StoryObj<typeof StatsCards>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
