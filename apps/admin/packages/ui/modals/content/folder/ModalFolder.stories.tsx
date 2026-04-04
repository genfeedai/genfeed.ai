import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalFolder from '@ui/modals/content/folder/ModalFolder';

const meta: Meta<typeof ModalFolder> = {
  argTypes: {},
  component: ModalFolder,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalFolder',
};

export default meta;
type Story = StoryObj<typeof ModalFolder>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
