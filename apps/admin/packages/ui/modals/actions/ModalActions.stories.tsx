import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalActions from '@ui/modals/actions/ModalActions';

const meta: Meta<typeof ModalActions> = {
  argTypes: {},
  component: ModalActions,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalActions',
};

export default meta;
type Story = StoryObj<typeof ModalActions>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
