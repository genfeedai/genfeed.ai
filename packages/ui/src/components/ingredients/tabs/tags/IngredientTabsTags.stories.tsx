import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientTabsTags from '@ui/ingredients/tabs/tags/IngredientTabsTags';

const meta: Meta<typeof IngredientTabsTags> = {
  argTypes: {},
  component: IngredientTabsTags,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientTabsTags',
};

export default meta;
type Story = StoryObj<typeof IngredientTabsTags>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
