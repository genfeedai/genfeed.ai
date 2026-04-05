import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientTabsCaptions from '@ui/ingredients/tabs/captions/IngredientTabsCaptions';

const meta: Meta<typeof IngredientTabsCaptions> = {
  argTypes: {},
  component: IngredientTabsCaptions,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientTabsCaptions',
};

export default meta;
type Story = StoryObj<typeof IngredientTabsCaptions>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
