import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPostMetadata from '@ui/modals/content/post/ModalPostMetadata';

const meta: Meta<typeof ModalPostMetadata> = {
  argTypes: {},
  component: ModalPostMetadata,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPostMetadata',
};

export default meta;
type Story = StoryObj<typeof ModalPostMetadata>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
