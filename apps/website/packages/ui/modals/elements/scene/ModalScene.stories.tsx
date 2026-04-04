import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalScene from '@ui/modals/elements/scene/ModalScene';

const meta: Meta<typeof ModalScene> = {
  argTypes: {},
  component: ModalScene,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalScene',
};

export default meta;
type Story = StoryObj<typeof ModalScene>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
