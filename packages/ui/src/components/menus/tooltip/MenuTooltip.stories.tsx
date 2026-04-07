import type { Meta, StoryObj } from '@storybook/nextjs';
import MenuTooltip from '@ui/menus/tooltip/MenuTooltip';

const meta: Meta<typeof MenuTooltip> = {
  argTypes: {},
  component: MenuTooltip,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Menus/MenuTooltip',
};

export default meta;
type Story = StoryObj<typeof MenuTooltip>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
