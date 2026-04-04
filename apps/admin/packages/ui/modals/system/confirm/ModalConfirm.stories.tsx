import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalConfirm from '@ui/modals/system/confirm/ModalConfirm';

const meta: Meta<typeof ModalConfirm> = {
  argTypes: {},
  component: ModalConfirm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalConfirm',
};

export default meta;
type Story = StoryObj<typeof ModalConfirm>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
