import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalCamera from '@ui/modals/elements/camera/ModalCamera';

const meta: Meta<typeof ModalCamera> = {
  argTypes: {},
  component: ModalCamera,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalCamera',
};

export default meta;
type Story = StoryObj<typeof ModalCamera>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
