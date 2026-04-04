import LoginForm from '@pages/login/login-form';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof LoginForm> = {
  argTypes: {},
  component: LoginForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Login/LoginForm',
};

export default meta;
type Story = StoryObj<typeof LoginForm>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
