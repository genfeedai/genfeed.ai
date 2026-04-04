import type { Meta, StoryObj } from '@storybook/nextjs';
import PlatformTabBar from '@website/packages/components/content/tab-bar/PlatformTabBar';

const meta: Meta<typeof PlatformTabBar> = {
  argTypes: {},
  component: PlatformTabBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Content/PlatformTabBar',
};

export default meta;
type Story = StoryObj<typeof PlatformTabBar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
