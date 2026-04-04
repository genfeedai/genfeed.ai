import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailExternalLinksCard> = {
  argTypes: {},
  component: BrandDetailExternalLinksCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailExternalLinksCard',
};

export default meta;
type Story = StoryObj<typeof BrandDetailExternalLinksCard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
