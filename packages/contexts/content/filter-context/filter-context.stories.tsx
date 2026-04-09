import FilterContext from '@genfeedai/contexts/content/filter-context/filter-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof FilterContext> = {
  argTypes: {},
  component: FilterContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Contexts/Content/FilterContext',
};

export default meta;
type Story = StoryObj<typeof FilterContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
