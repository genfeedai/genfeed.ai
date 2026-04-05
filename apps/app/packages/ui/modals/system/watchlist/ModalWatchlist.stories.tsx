import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalWatchlist from '@ui/modals/system/watchlist/ModalWatchlist';

const meta: Meta<typeof ModalWatchlist> = {
  argTypes: {},
  component: ModalWatchlist,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalWatchlist',
};

export default meta;
type Story = StoryObj<typeof ModalWatchlist>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
