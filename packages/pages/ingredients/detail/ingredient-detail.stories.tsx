import IngredientDetail from '@pages/ingredients/detail/ingredient-detail';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof IngredientDetail> = {
  argTypes: {},
  component: IngredientDetail,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Ingredients/IngredientDetail',
};

export default meta;
type Story = StoryObj<typeof IngredientDetail>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
