import PostsIngredientsList from '@pages/posts/ingredients/posts-ingredients-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof PostsIngredientsList> = {
  argTypes: {},
  component: PostsIngredientsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Posts/PostsIngredientsList',
};

export default meta;
type Story = StoryObj<typeof PostsIngredientsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
