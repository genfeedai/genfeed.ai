import type { Meta, StoryObj } from '@storybook/nextjs';
import StylesList from './styles-list';

const meta: Meta<typeof StylesList> = {
  argTypes: {},
  component: StylesList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/StylesList',
};

export default meta;
type Story = StoryObj<typeof StylesList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
