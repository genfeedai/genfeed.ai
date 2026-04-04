import MarketplaceList from '@pages/marketplace/marketplace-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof MarketplaceList> = {
  argTypes: {},
  component: MarketplaceList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/MarketplaceList',
};

export default meta;
type Story = StoryObj<typeof MarketplaceList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
