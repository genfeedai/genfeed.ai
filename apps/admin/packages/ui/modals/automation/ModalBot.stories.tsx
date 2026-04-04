import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalBot from '@ui/modals/automation/ModalBot';

const meta: Meta<typeof ModalBot> = {
  argTypes: {},
  component: ModalBot,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalBot',
};

export default meta;
type Story = StoryObj<typeof ModalBot>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
