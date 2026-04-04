import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPreset from '@ui/modals/elements/preset/ModalPreset';

const meta: Meta<typeof ModalPreset> = {
  argTypes: {},
  component: ModalPreset,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPreset',
};

export default meta;
type Story = StoryObj<typeof ModalPreset>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
