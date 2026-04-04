import UserContext from '@contexts/user/user-context/user-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof UserContext> = {
  argTypes: {},
  component: UserContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Contexts/User/UserContext',
};

export default meta;
type Story = StoryObj<typeof UserContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
