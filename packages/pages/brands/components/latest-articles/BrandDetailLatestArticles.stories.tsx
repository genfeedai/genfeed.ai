import BrandDetailLatestArticles from '@pages/brands/components/latest-articles/BrandDetailLatestArticles';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailLatestArticles> = {
  argTypes: {},
  component: BrandDetailLatestArticles,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailLatestArticles',
};

export default meta;
type Story = StoryObj<typeof BrandDetailLatestArticles>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
