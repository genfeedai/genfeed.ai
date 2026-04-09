import type { Meta, StoryObj } from '@storybook/nextjs';
import BlacklistsList from './blacklists-list';

const meta: Meta<typeof BlacklistsList> = {
  argTypes: {},
  component: BlacklistsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/BlacklistsList',
};

export default meta;
type Story = StoryObj<typeof BlacklistsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
