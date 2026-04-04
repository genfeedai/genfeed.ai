import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailSystemPrompt> = {
  argTypes: {},
  component: BrandDetailSystemPrompt,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailSystemPrompt',
};

export default meta;
type Story = StoryObj<typeof BrandDetailSystemPrompt>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
