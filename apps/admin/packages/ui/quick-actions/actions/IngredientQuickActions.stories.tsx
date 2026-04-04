import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';

const meta: Meta<typeof IngredientQuickActions> = {
  argTypes: {},
  component: IngredientQuickActions,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/QuickActions/IngredientQuickActions',
};

export default meta;
type Story = StoryObj<typeof IngredientQuickActions>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
