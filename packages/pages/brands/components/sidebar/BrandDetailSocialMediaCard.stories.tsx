import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailSocialMediaCard> = {
  argTypes: {},
  component: BrandDetailSocialMediaCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailSocialMediaCard',
};

export default meta;
type Story = StoryObj<typeof BrandDetailSocialMediaCard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
