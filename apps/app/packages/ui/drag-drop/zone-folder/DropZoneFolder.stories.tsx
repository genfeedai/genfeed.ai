import type { Meta, StoryObj } from '@storybook/nextjs';
import DropZoneFolder from '@ui/drag-drop/zone-folder/DropZoneFolder';

const meta: Meta<typeof DropZoneFolder> = {
  argTypes: {},
  component: DropZoneFolder,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/DragDrop/DropZoneFolder',
};

export default meta;
type Story = StoryObj<typeof DropZoneFolder>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
