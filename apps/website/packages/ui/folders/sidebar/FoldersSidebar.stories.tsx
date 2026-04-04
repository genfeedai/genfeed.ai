import type { Meta, StoryObj } from '@storybook/nextjs';
import FoldersSidebar from '@ui/folders/sidebar/FoldersSidebar';

const meta: Meta<typeof FoldersSidebar> = {
  argTypes: {},
  component: FoldersSidebar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Folders/FoldersSidebar',
};

export default meta;
type Story = StoryObj<typeof FoldersSidebar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
