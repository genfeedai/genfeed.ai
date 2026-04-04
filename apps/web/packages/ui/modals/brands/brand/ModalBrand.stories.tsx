import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalBrand from '@ui/modals/brands/brand/ModalBrand';

const meta: Meta<typeof ModalBrand> = {
  argTypes: {},
  component: ModalBrand,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalBrand',
};

export default meta;
type Story = StoryObj<typeof ModalBrand>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
