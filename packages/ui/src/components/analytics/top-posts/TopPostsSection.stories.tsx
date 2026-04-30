import type { Meta, StoryObj } from '@storybook/nextjs';
import TopPostsSection from '@ui/analytics/top-posts/TopPostsSection';

const meta: Meta<typeof TopPostsSection> = {
  component: TopPostsSection,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Analytics/TopPostsSection',
};

export default meta;
type Story = StoryObj<typeof TopPostsSection>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
