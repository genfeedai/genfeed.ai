import ProtectedProviders from '@providers/protected-providers/protected-providers';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof ProtectedProviders> = {
  argTypes: {},
  component: ProtectedProviders,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Providers/ProtectedProviders.tsx/ProtectedProviders',
};

export default meta;
type Story = StoryObj<typeof ProtectedProviders>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
