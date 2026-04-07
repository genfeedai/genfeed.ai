import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalBlacklist from '@ui/modals/elements/blacklist/ModalBlacklist';

const meta: Meta<typeof ModalBlacklist> = {
  argTypes: {},
  component: ModalBlacklist,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalBlacklist',
};

export default meta;
type Story = StoryObj<typeof ModalBlacklist>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
