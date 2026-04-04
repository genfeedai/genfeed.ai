import type { Meta, StoryObj } from '@storybook/nextjs';
import FoldersSidebarPanel from '@ui/ingredients/list/folders-sidebar-panel/FoldersSidebarPanel';

const meta: Meta<typeof FoldersSidebarPanel> = {
  argTypes: {},
  component: FoldersSidebarPanel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ingredients/FoldersSidebarPanel',
};

export default meta;
type Story = StoryObj<typeof FoldersSidebarPanel>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
