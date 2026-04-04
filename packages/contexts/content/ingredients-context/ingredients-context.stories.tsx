import IngredientsContext from '@contexts/content/ingredients-context/ingredients-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof IngredientsContext> = {
  argTypes: {},
  component: IngredientsContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Contexts/Content/IngredientsContext',
};

export default meta;
type Story = StoryObj<typeof IngredientsContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
