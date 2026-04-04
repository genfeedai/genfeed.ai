import { Platform } from '@genfeedai/enums';
import * as PostsHelper from '@helpers/content/posts.helper';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Tabs from '@ui/navigation/tabs/Tabs';
import { useState } from 'react';

type PostPlatformTabsDemoProps = {
  platforms?: Platform[];
};

function PostPlatformTabsDemo({ platforms }: PostPlatformTabsDemoProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const tabs = PostsHelper.getPostPlatformTabs(platforms);

  return <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />;
}

const meta: Meta<typeof PostPlatformTabsDemo> = {
  argTypes: {
    platforms: {
      control: 'object',
      description: 'Array of platforms to include in tabs',
    },
  },
  component: PostPlatformTabsDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Helpers/Content/Posts.helper',
};

export default meta;
type Story = StoryObj<typeof PostPlatformTabsDemo>;

export const Default: Story = {
  args: {
    platforms: [
      Platform.YOUTUBE,
      Platform.INSTAGRAM,
      Platform.TWITTER,
      Platform.TIKTOK,
    ],
  },
};

export const AllPlatforms: Story = {
  args: {
    platforms: Object.values(Platform),
  },
};

export const SinglePlatform: Story = {
  args: {
    platforms: [Platform.YOUTUBE],
  },
};
