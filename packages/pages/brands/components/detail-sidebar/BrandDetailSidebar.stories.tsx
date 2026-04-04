import BrandDetailSidebar from '@pages/brands/components/detail-sidebar/BrandDetailSidebar';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailSidebar> = {
  argTypes: {},
  component: BrandDetailSidebar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailSidebar',
};

export default meta;
type Story = StoryObj<typeof BrandDetailSidebar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
