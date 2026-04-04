import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalStyle from '@ui/modals/elements/style/ModalStyle';

const meta: Meta<typeof ModalStyle> = {
  argTypes: {},
  component: ModalStyle,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalStyle',
};

export default meta;
type Story = StoryObj<typeof ModalStyle>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
