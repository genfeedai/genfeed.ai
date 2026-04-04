import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalSound from '@ui/modals/elements/sound/ModalSound';

const meta: Meta<typeof ModalSound> = {
  argTypes: {},
  component: ModalSound,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalSound',
};

export default meta;
type Story = StoryObj<typeof ModalSound>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
