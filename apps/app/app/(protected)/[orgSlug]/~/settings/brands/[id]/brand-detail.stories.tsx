import type { Meta, StoryObj } from '@storybook/nextjs';
import BrandDetail from './brand-detail';

const meta: Meta<typeof BrandDetail> = {
  argTypes: {},
  component: BrandDetail,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetail',
};

export default meta;
type Story = StoryObj<typeof BrandDetail>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
