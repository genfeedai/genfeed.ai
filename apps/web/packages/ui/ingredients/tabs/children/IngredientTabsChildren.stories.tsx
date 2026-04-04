import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientTabsChildren from '@ui/ingredients/tabs/children/IngredientTabsChildren';

const meta: Meta<typeof IngredientTabsChildren> = {
  argTypes: {},
  component: IngredientTabsChildren,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientTabsChildren',
};

export default meta;
type Story = StoryObj<typeof IngredientTabsChildren>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
