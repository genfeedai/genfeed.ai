import type { Meta, StoryObj } from '@storybook/nextjs';
import IngredientTabsMetadata from '@ui/ingredients/tabs/metadata/IngredientTabsMetadata';

const meta: Meta<typeof IngredientTabsMetadata> = {
  argTypes: {},
  component: IngredientTabsMetadata,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/IngredientTabsMetadata',
};

export default meta;
type Story = StoryObj<typeof IngredientTabsMetadata>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
