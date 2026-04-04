import type { Meta, StoryObj } from '@storybook/nextjs';
import FiltersBar from '@ui/content/filters-bar/FiltersBar';

const meta: Meta<typeof FiltersBar> = {
  argTypes: {},
  component: FiltersBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/FiltersBar',
};

export default meta;
type Story = StoryObj<typeof FiltersBar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
