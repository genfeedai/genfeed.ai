import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientsListHeader from '@ui/ingredients/list/header/IngredientsListHeader';

const meta: Meta<typeof IngredientsListHeader> = {
  argTypes: {},
  component: IngredientsListHeader,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientsListHeader',
};

export default meta;
type Story = StoryObj<typeof IngredientsListHeader>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
