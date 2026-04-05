import type { Meta, StoryObj } from '@storybook/nextjs';
import GalleryLayout from '@ui/gallery/layout/GalleryLayout';

const meta: Meta<typeof GalleryLayout> = {
  argTypes: {},
  component: GalleryLayout,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/galleryLayout',
};

export default meta;
type Story = StoryObj<typeof GalleryLayout>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
