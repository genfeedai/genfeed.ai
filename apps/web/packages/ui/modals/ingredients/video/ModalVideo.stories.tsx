import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalVideo from '@ui/modals/ingredients/video/ModalVideo';

const meta: Meta<typeof ModalVideo> = {
  argTypes: {},
  component: ModalVideo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalVideo',
};

export default meta;
type Story = StoryObj<typeof ModalVideo>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
