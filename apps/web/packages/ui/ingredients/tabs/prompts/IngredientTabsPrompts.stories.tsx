import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientTabsPrompts from '@ui/ingredients/tabs/prompts/IngredientTabsPrompts';

const meta: Meta<typeof IngredientTabsPrompts> = {
  argTypes: {},
  component: IngredientTabsPrompts,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientTabsPrompts',
};

export default meta;
type Story = StoryObj<typeof IngredientTabsPrompts>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
