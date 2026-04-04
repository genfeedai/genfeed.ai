import BrandDetailReferencesCard from '@pages/brands/components/sidebar/BrandDetailReferencesCard';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailReferencesCard> = {
  argTypes: {},
  component: BrandDetailReferencesCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailReferencesCard',
};

export default meta;
type Story = StoryObj<typeof BrandDetailReferencesCard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
