import type { Meta, StoryObj } from '@storybook/nextjs';
import ContentPreviewSidebar from '@ui/preview/ContentPreviewSidebar';

const meta: Meta<typeof ContentPreviewSidebar> = {
  argTypes: {},
  component: ContentPreviewSidebar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Preview/ContentPreviewSidebar',
};

export default meta;
type Story = StoryObj<typeof ContentPreviewSidebar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
