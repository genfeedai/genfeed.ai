import BrandDetailLatestVideos from '@pages/brands/components/latest-videos/BrandDetailLatestVideos';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailLatestVideos> = {
  argTypes: {},
  component: BrandDetailLatestVideos,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailLatestVideos',
};

export default meta;
type Story = StoryObj<typeof BrandDetailLatestVideos>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
