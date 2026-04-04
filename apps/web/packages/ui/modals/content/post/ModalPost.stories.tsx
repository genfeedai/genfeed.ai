import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPost from '@ui/modals/content/post/ModalPost';

const meta: Meta<typeof ModalPost> = {
  argTypes: {},
  component: ModalPost,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPost',
};

export default meta;
type Story = StoryObj<typeof ModalPost>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
