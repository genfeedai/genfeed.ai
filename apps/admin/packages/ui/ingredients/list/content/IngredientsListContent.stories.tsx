import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientsListContent from '@ui/ingredients/list/content/IngredientsListContent';

const meta: Meta<typeof IngredientsListContent> = {
  argTypes: {},
  component: IngredientsListContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientsListContent',
};

export default meta;
type Story = StoryObj<typeof IngredientsListContent>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
