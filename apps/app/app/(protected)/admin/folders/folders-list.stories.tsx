import type { Meta, StoryObj } from '@storybook/nextjs';
import FoldersList from './folders-list';

const meta: Meta<typeof FoldersList> = {
  argTypes: {},
  component: FoldersList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Folders/FoldersList',
};

export default meta;
type Story = StoryObj<typeof FoldersList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
