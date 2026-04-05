import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalIngredient from '@ui/modals/ingredients/ingredient/ModalIngredient';

const meta: Meta<typeof ModalIngredient> = {
  argTypes: {},
  component: ModalIngredient,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalIngredient',
};

export default meta;
type Story = StoryObj<typeof ModalIngredient>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
