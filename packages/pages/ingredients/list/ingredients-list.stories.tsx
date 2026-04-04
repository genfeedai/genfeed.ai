import IngredientsList from '@pages/ingredients/list/ingredients-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof IngredientsList> = {
  argTypes: {},
  component: IngredientsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Ingredients/IngredientsList',
};

export default meta;
type Story = StoryObj<typeof IngredientsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
