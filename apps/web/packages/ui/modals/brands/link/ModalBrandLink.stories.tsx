import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalBrandLink from '@ui/modals/brands/link/ModalBrandLink';

const meta: Meta<typeof ModalBrandLink> = {
  argTypes: {},
  component: ModalBrandLink,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalBrandLink',
};

export default meta;
type Story = StoryObj<typeof ModalBrandLink>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
