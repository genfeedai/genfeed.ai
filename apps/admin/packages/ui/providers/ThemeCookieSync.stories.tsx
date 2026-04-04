import type { Meta, StoryObj } from '@storybook/nextjs';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';

const meta: Meta<typeof ThemeCookieSync> = {
  argTypes: {},
  component: ThemeCookieSync,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Providers/ThemeCookieSync',
};

export default meta;
type Story = StoryObj<typeof ThemeCookieSync>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
