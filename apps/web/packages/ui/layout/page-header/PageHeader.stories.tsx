import type { Meta, StoryObj } from '@storybook/nextjs';
import PageHeader from '@ui/layout/page-header/PageHeader';

const meta: Meta<typeof PageHeader> = {
  argTypes: {},
  component: PageHeader,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/PageHeader',
};

export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
