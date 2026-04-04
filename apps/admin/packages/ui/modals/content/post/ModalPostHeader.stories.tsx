import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPostHeader from '@ui/modals/content/post/ModalPostHeader';

const meta: Meta<typeof ModalPostHeader> = {
  argTypes: {},
  component: ModalPostHeader,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPostHeader',
};

export default meta;
type Story = StoryObj<typeof ModalPostHeader>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
