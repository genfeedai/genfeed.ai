import type { Meta, StoryObj } from '@storybook/nextjs';
import MenuBrandSwitcher from '@ui/menus/switchers/MenuBrandSwitcher';

const meta: Meta<typeof MenuBrandSwitcher> = {
  argTypes: {},
  component: MenuBrandSwitcher,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Menus/MenuBrandSwitcher',
};

export default meta;
type Story = StoryObj<typeof MenuBrandSwitcher>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
