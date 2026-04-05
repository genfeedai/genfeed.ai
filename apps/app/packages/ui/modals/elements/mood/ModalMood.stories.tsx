import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalMood from '@ui/modals/elements/mood/ModalMood';

const meta: Meta<typeof ModalMood> = {
  argTypes: {},
  component: ModalMood,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalMood',
};

export default meta;
type Story = StoryObj<typeof ModalMood>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
