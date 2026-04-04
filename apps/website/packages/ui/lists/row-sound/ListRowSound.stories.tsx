import type { Meta, StoryObj } from '@storybook/nextjs';
import ListRowSound from '@ui/lists/row-sound/ListRowSound';

const meta: Meta<typeof ListRowSound> = {
  argTypes: {},
  component: ListRowSound,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Lists/ListRowSound',
};

export default meta;
type Story = StoryObj<typeof ListRowSound>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
