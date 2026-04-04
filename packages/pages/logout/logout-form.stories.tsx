import LogoutForm from '@pages/logout/logout-form';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof LogoutForm> = {
  argTypes: {},
  component: LogoutForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Logout/LogoutForm',
};

export default meta;
type Story = StoryObj<typeof LogoutForm>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
