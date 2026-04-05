import type { Meta, StoryObj } from '@storybook/nextjs';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';

const meta: Meta<typeof TopbarLogo> = {
  argTypes: {},
  component: TopbarLogo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Topbars/TopbarLogo',
};

export default meta;
type Story = StoryObj<typeof TopbarLogo>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
