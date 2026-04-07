import type { Meta, StoryObj } from '@storybook/nextjs';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';

const meta: Meta<typeof AutoPagination> = {
  argTypes: {},
  component: AutoPagination,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/AutoPagination',
};

export default meta;
type Story = StoryObj<typeof AutoPagination>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
