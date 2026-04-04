import SignUpForm from '@pages/sign-up/sign-up-form';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof SignUpForm> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
  component: SignUpForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/SignUp/SignUpForm',
};

export default meta;
type Story = StoryObj<typeof SignUpForm>;

export const Default: Story = {
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
