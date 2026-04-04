import BrandDetailBanner from '@pages/brands/components/banner/BrandDetailBanner';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailBanner> = {
  argTypes: {},
  component: BrandDetailBanner,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailBanner',
};

export default meta;
type Story = StoryObj<typeof BrandDetailBanner>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
