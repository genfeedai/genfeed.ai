import IngredientPosts from '@pages/posts/[id]/ingredient-posts';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof IngredientPosts> = {
  argTypes: {},
  component: IngredientPosts,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Posts/IngredientPosts',
};

export default meta;
type Story = StoryObj<typeof IngredientPosts>;

export const Default: Story = {
  args: {
    id: 'ingredient-1',
    ingredient: {
      id: 'ingredient-1',
      metadataDescription: 'Demo ingredient',
      metadataLabel: 'Demo Ingredient',
      totalPosts: 0,
      totalViews: 0,
    },
    page: 1,
    posts: [],
  },
};

export const Interactive: Story = {
  args: {
    id: 'ingredient-2',
    ingredient: {
      id: 'ingredient-2',
      metadataDescription: 'Interactive ingredient',
      metadataLabel: 'Interactive Ingredient',
      totalPosts: 2,
      totalViews: 123,
    },
    page: 1,
    posts: [],
  },
};
