import UseModal from '@hooks/ui/use-modal/use-modal';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof UseModal> = {
  argTypes: {},
  component: UseModal,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Hooks/Ui/UseModal',
};

export default meta;
type Story = StoryObj<typeof UseModal>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
