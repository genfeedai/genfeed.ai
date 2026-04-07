import type { Meta, StoryObj } from '@storybook/nextjs';
import MenuAppSwitcher from '@ui/menus/switchers/MenuAppSwitcher';

const meta: Meta<typeof MenuAppSwitcher> = {
  argTypes: {},
  component: MenuAppSwitcher,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Menus/MenuAppSwitcher',
};

export default meta;
type Story = StoryObj<typeof MenuAppSwitcher>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
