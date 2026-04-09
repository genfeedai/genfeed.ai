import type { Meta, StoryObj } from '@storybook/nextjs';
import ThreadPreviewPanel from '@ui/posts/preview/thread-preview-panel/ThreadPreviewPanel';

const meta: Meta<typeof ThreadPreviewPanel> = {
  argTypes: {},
  component: ThreadPreviewPanel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Posts/ThreadPreviewPanel',
};

export default meta;
type Story = StoryObj<typeof ThreadPreviewPanel>;

export const Default: Story = {
  args: {
    replies: [
      { content: '<p>First reply content</p>', id: 'child-1' },
      { content: '<p>Second reply content</p>', id: 'child-2' },
    ],
    parent: { content: '<p>Parent post content</p>', id: 'parent' },
  },
};

export const Interactive: Story = {
  args: {
    replies: [
      { content: '<p>Reply A</p>', id: 'child-1' },
      { content: '<p>Reply B</p>', id: 'child-2' },
      { content: '<p>Reply C</p>', id: 'child-3' },
    ],
    parent: { content: '<p>Try editing args</p>', id: 'parent' },
  },
};
