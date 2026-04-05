import type { Meta, StoryObj } from '@storybook/nextjs';
import ContainerTitle from '@ui/layout/container-title/ContainerTitle';

const meta: Meta<typeof ContainerTitle> = {
  argTypes: {},
  component: ContainerTitle,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/ContainerTitle',
};

export default meta;
type Story = StoryObj<typeof ContainerTitle>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
