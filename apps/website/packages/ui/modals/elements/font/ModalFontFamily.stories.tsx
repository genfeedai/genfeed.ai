import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalFontFamily from '@ui/modals/elements/font/ModalFontFamily';

const meta: Meta<typeof ModalFontFamily> = {
  argTypes: {},
  component: ModalFontFamily,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalFontFamily',
};

export default meta;
type Story = StoryObj<typeof ModalFontFamily>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
