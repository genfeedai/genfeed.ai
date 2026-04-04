import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientSound from '@ui/ingredients/sound/IngredientSound';

const meta: Meta<typeof IngredientSound> = {
  argTypes: {},
  component: IngredientSound,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientSound',
};

export default meta;
type Story = StoryObj<typeof IngredientSound>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
