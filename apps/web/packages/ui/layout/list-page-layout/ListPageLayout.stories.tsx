import type { Meta, StoryObj } from '@storybook/nextjs';
import ListPageLayout from '@ui/layout/list-page-layout/ListPageLayout';

const meta: Meta<typeof ListPageLayout> = {
  argTypes: {},
  component: ListPageLayout,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/ListPageLayout',
};

export default meta;
type Story = StoryObj<typeof ListPageLayout>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
