import BrandDetailOverview from '@pages/brands/components/overview/BrandDetailOverview';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailOverview> = {
  argTypes: {},
  component: BrandDetailOverview,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailOverview',
};

export default meta;
type Story = StoryObj<typeof BrandDetailOverview>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
