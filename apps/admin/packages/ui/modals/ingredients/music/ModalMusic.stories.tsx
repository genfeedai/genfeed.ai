import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalMusic from '@ui/modals/ingredients/music/ModalMusic';

const meta: Meta<typeof ModalMusic> = {
  argTypes: {},
  component: ModalMusic,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalMusic',
};

export default meta;
type Story = StoryObj<typeof ModalMusic>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
