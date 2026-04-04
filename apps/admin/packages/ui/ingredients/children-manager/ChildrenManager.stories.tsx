import type { Meta, StoryObj } from '@storybook/nextjs';
import ChildrenManager from '@ui/ingredients/children-manager/ChildrenManager';

const meta: Meta<typeof ChildrenManager> = {
  argTypes: {},
  component: ChildrenManager,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/ChildrenManager',
};

export default meta;
type Story = StoryObj<typeof ChildrenManager>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
