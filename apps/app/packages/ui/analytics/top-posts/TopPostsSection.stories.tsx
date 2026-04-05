import type { Meta, StoryObj } from '@storybook/nextjs';
import TopPostsSection from '@ui/analytics/top-posts/TopPostsSection';

const meta: Meta<typeof TopPostsSection> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
