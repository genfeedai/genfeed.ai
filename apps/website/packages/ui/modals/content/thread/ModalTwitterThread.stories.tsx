import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalTwitterThread from '@ui/modals/content/thread/ModalTwitterThread';

const meta: Meta<typeof ModalTwitterThread> = {
  argTypes: {},
  component: ModalTwitterThread,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalTwitterThread',
};

export default meta;
type Story = StoryObj<typeof ModalTwitterThread>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
