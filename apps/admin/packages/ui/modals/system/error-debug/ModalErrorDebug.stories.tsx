import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalErrorDebug from '@ui/modals/system/error-debug/ModalErrorDebug';

const meta: Meta<typeof ModalErrorDebug> = {
  argTypes: {},
  component: ModalErrorDebug,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalErrorDebug',
};

export default meta;
type Story = StoryObj<typeof ModalErrorDebug>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
