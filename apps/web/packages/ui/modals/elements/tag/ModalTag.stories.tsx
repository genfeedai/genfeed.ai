import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalTag from '@ui/modals/elements/tag/ModalTag';

const meta: Meta<typeof ModalTag> = {
  argTypes: {},
  component: ModalTag,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalTag',
};

export default meta;
type Story = StoryObj<typeof ModalTag>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
