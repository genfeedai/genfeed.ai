import ImagesList from '@pages/marketplace/images/images-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof ImagesList> = {
  argTypes: {},
  component: ImagesList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/ImagesList',
};

export default meta;
type Story = StoryObj<typeof ImagesList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
