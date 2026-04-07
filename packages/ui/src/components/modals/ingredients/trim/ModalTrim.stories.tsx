import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalTrim from '@ui/modals/ingredients/trim/ModalTrim';

const meta: Meta<typeof ModalTrim> = {
  argTypes: {},
  component: ModalTrim,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalTrim',
};

export default meta;
type Story = StoryObj<typeof ModalTrim>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
