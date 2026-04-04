import BrandDetailDefaultModelsCard from '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailDefaultModelsCard> = {
  argTypes: {},
  component: BrandDetailDefaultModelsCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailDefaultModelsCard',
};

export default meta;
type Story = StoryObj<typeof BrandDetailDefaultModelsCard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
