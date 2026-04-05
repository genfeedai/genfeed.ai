import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalCredential from '@ui/modals/system/credential/ModalCredential';

const meta: Meta<typeof ModalCredential> = {
  argTypes: {},
  component: ModalCredential,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalCredential',
};

export default meta;
type Story = StoryObj<typeof ModalCredential>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
