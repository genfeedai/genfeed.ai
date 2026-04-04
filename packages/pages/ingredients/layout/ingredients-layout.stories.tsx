import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof IngredientsLayout> = {
  argTypes: {},
  component: IngredientsLayout,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Ingredients/IngredientsLayout',
};

export default meta;
type Story = StoryObj<typeof IngredientsLayout>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
