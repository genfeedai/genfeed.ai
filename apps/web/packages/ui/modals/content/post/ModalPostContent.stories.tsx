import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPostContent from '@ui/modals/content/post/ModalPostContent';

const meta: Meta<typeof ModalPostContent> = {
  argTypes: {},
  component: ModalPostContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPostContent',
};

export default meta;
type Story = StoryObj<typeof ModalPostContent>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
