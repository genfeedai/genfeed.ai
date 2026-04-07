import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalLighting from '@ui/modals/elements/lighting/ModalLighting';

const meta: Meta<typeof ModalLighting> = {
  argTypes: {},
  component: ModalLighting,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalLighting',
};

export default meta;
type Story = StoryObj<typeof ModalLighting>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
