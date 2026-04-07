import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalGalleryFooter from '@ui/modals/gallery/ModalGalleryFooter';

const meta: Meta<typeof ModalGalleryFooter> = {
  argTypes: {},
  component: ModalGalleryFooter,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalGalleryFooter',
};

export default meta;
type Story = StoryObj<typeof ModalGalleryFooter>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
