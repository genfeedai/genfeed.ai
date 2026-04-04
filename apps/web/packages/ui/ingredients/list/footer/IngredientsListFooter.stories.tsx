import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientsListFooter from '@ui/ingredients/list/footer/IngredientsListFooter';

const meta: Meta<typeof IngredientsListFooter> = {
  argTypes: {},
  component: IngredientsListFooter,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientsListFooter',
};

export default meta;
type Story = StoryObj<typeof IngredientsListFooter>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
