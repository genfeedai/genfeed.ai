import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalAvatar from '@ui/modals/ingredients/avatar/ModalAvatar';

const meta: Meta<typeof ModalAvatar> = {
  argTypes: {},
  component: ModalAvatar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalAvatar',
};

export default meta;
type Story = StoryObj<typeof ModalAvatar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
