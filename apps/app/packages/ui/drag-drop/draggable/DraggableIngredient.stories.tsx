import type { Meta, StoryObj } from '@storybook/nextjs';
import DraggableIngredient from '@ui/drag-drop/draggable/DraggableIngredient';

const meta: Meta<typeof DraggableIngredient> = {
  argTypes: {},
  component: DraggableIngredient,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/DragDrop/DraggableIngredient',
};

export default meta;
type Story = StoryObj<typeof DraggableIngredient>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
