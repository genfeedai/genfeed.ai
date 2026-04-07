import type { Meta, StoryObj } from '@storybook/nextjs';
import { SimpleTooltip } from '@ui/primitives/tooltip';

const meta: Meta<typeof SimpleTooltip> = {
  argTypes: {
    isDisabled: {
      control: 'boolean',
    },
    label: {
      control: 'text',
    },
    position: {
      control: 'select',
      options: ['top', 'bottom', 'left', 'right'],
    },
  },
  component: SimpleTooltip,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/Tooltip',
};

export default meta;
type Story = StoryObj<typeof SimpleTooltip>;

export const Default: Story = {
  args: {
    children: (
      <button className="px-4 py-2 bg-primary text-white">Hover me</button>
    ),
    label: 'This is a tooltip',
    position: 'top',
  },
};

export const Bottom: Story = {
  args: {
    children: (
      <button className="px-4 py-2 bg-primary text-white">Hover me</button>
    ),
    label: 'Tooltip on bottom',
    position: 'bottom',
  },
};

export const Left: Story = {
  args: {
    children: (
      <button className="px-4 py-2 bg-primary text-white">Hover me</button>
    ),
    label: 'Tooltip on left',
    position: 'left',
  },
};

export const Right: Story = {
  args: {
    children: (
      <button className="px-4 py-2 bg-primary text-white">Hover me</button>
    ),
    label: 'Tooltip on right',
    position: 'right',
  },
};

export const Disabled: Story = {
  args: {
    children: (
      <button className="px-4 py-2 bg-primary text-white">
        Hover me (no tooltip)
      </button>
    ),
    isDisabled: true,
    label: 'This tooltip is disabled',
    position: 'top',
  },
};
