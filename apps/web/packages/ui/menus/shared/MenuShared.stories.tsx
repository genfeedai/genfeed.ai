import type { Meta, StoryObj } from '@storybook/nextjs';
import MenuShared from '@ui/menus/shared/MenuShared';

const meta: Meta<typeof MenuShared> = {
  argTypes: {},
  component: MenuShared,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Menus/MenuShared',
};

export default meta;
type Story = StoryObj<typeof MenuShared>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
