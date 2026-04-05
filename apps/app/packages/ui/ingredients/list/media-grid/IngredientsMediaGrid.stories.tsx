import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientsMediaGrid from '@ui/ingredients/list/media-grid/IngredientsMediaGrid';

const meta: Meta<typeof IngredientsMediaGrid> = {
  argTypes: {},
  component: IngredientsMediaGrid,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientsMediaGrid',
};

export default meta;
type Story = StoryObj<typeof IngredientsMediaGrid>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
