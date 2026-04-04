import BrandDetailLatestImages from '@pages/brands/components/latest-images/BrandDetailLatestImages';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailLatestImages> = {
  argTypes: {},
  component: BrandDetailLatestImages,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailLatestImages',
};

export default meta;
type Story = StoryObj<typeof BrandDetailLatestImages>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
