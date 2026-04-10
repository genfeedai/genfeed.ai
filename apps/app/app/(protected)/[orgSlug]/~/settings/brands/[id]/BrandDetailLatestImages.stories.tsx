import type { Meta, StoryObj } from '@storybook/nextjs';
import BrandDetailLatestImages from './BrandDetailLatestImages';

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
