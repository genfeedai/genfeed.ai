import type { Meta, StoryObj } from '@storybook/nextjs';
import OverviewLayout from '@ui/overview/OverviewLayout';

const meta: Meta<typeof OverviewLayout> = {
  argTypes: {},
  component: OverviewLayout,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Overview/OverviewLayout',
};

export default meta;
type Story = StoryObj<typeof OverviewLayout>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
