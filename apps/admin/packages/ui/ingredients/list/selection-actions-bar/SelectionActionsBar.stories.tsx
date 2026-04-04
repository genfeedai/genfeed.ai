import type { Meta, StoryObj } from '@storybook/nextjs';
import SelectionActionsBar from '@ui/ingredients/list/selection-actions-bar/SelectionActionsBar';

const meta: Meta<typeof SelectionActionsBar> = {
  argTypes: {},
  component: SelectionActionsBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/SelectionActionsBar',
};

export default meta;
type Story = StoryObj<typeof SelectionActionsBar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
