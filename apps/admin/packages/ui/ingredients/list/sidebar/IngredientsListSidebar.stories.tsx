import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientsListSidebar from '@ui/ingredients/list/sidebar/IngredientsListSidebar';

const meta: Meta<typeof IngredientsListSidebar> = {
  argTypes: {},
  component: IngredientsListSidebar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientsListSidebar',
};

export default meta;
type Story = StoryObj<typeof IngredientsListSidebar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
