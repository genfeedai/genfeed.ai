import type { Meta, StoryObj } from '@storybook/nextjs';
import List from '@ui/lists/list/List';

const meta: Meta<typeof List> = {
  argTypes: {},
  component: List,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Lists/List',
};

export default meta;
type Story = StoryObj<typeof List>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
