import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientTabsPosts from '@ui/ingredients/tabs/posts/IngredientTabsPosts';

const meta: Meta<typeof IngredientTabsPosts> = {
  argTypes: {},
  component: IngredientTabsPosts,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientTabsPosts',
};

export default meta;
type Story = StoryObj<typeof IngredientTabsPosts>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
