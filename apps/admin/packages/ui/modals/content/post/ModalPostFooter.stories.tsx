import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPostFooter from '@ui/modals/content/post/ModalPostFooter';

const meta: Meta<typeof ModalPostFooter> = {
  argTypes: {},
  component: ModalPostFooter,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPostFooter',
};

export default meta;
type Story = StoryObj<typeof ModalPostFooter>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
