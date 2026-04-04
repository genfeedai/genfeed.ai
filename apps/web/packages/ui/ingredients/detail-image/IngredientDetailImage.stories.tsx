import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientDetailImage from '@ui/ingredients/detail-image/IngredientDetailImage';

const meta: Meta<typeof IngredientDetailImage> = {
  argTypes: {},
  component: IngredientDetailImage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientDetailImage',
};

export default meta;
type Story = StoryObj<typeof IngredientDetailImage>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
