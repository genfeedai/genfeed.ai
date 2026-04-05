import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientDetailVideo from '@ui/ingredients/detail-video/IngredientDetailVideo';

const meta: Meta<typeof IngredientDetailVideo> = {
  argTypes: {},
  component: IngredientDetailVideo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientDetailVideo',
};

export default meta;
type Story = StoryObj<typeof IngredientDetailVideo>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
