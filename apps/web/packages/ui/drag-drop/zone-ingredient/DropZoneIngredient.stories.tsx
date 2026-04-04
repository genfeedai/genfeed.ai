import type { Meta, StoryObj } from '@storybook/nextjs';
import DropZoneIngredient from '@ui/drag-drop/zone-ingredient/DropZoneIngredient';

const meta: Meta<typeof DropZoneIngredient> = {
  argTypes: {},
  component: DropZoneIngredient,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/DragDrop/DropZoneIngredient',
};

export default meta;
type Story = StoryObj<typeof DropZoneIngredient>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
