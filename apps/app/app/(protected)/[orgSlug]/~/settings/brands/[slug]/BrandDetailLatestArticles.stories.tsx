import type { Meta, StoryObj } from '@storybook/nextjs';
import BrandDetailLatestArticles from './BrandDetailLatestArticles';

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
