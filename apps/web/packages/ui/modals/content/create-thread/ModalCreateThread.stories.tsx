import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalCreateThread from '@ui/modals/content/create-thread/ModalCreateThread';

const meta: Meta<typeof ModalCreateThread> = {
  argTypes: {},
  component: ModalCreateThread,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalCreateThread',
};

export default meta;
type Story = StoryObj<typeof ModalCreateThread>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
