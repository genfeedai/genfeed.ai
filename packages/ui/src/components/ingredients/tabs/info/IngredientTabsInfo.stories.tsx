import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientTabsInfo from '@ui/ingredients/tabs/info/IngredientTabsInfo';

const meta: Meta<typeof IngredientTabsInfo> = {
  argTypes: {},
  component: IngredientTabsInfo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientTabsInfo',
};

export default meta;
type Story = StoryObj<typeof IngredientTabsInfo>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
