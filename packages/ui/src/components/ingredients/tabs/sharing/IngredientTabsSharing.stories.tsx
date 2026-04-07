import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientTabsSharing from '@ui/ingredients/tabs/sharing/IngredientTabsSharing';

const meta: Meta<typeof IngredientTabsSharing> = {
  argTypes: {},
  component: IngredientTabsSharing,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientTabsSharing',
};

export default meta;
type Story = StoryObj<typeof IngredientTabsSharing>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
