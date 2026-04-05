import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalUpload from '@ui/modals/ingredients/upload/ModalUpload';

const meta: Meta<typeof ModalUpload> = {
  argTypes: {},
  component: ModalUpload,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalUpload',
};

export default meta;
type Story = StoryObj<typeof ModalUpload>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
