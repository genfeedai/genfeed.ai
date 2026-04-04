import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientTabs from '@ui/ingredients/ingredient-tabs/IngredientTabs';

const meta: Meta<typeof IngredientTabs> = {
  argTypes: {},
  component: IngredientTabs,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientTabs',
};

export default meta;
type Story = StoryObj<typeof IngredientTabs>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
