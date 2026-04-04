import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalTextOverlay from '@ui/modals/content/overlay/ModalTextOverlay';

const meta: Meta<typeof ModalTextOverlay> = {
  argTypes: {},
  component: ModalTextOverlay,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalTextOverlay',
};

export default meta;
type Story = StoryObj<typeof ModalTextOverlay>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
