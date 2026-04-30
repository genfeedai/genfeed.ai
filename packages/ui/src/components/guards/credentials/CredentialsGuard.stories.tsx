import type { Meta, StoryObj } from '@storybook/nextjs';
import CredentialsGuard from '@ui/guards/credentials/CredentialsGuard';

const meta: Meta<typeof CredentialsGuard> = {
  component: CredentialsGuard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Guards/CredentialsGuard',
};

export default meta;
type Story = StoryObj<typeof CredentialsGuard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
