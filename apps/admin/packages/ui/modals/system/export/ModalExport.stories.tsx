import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalExport from '@ui/modals/system/export/ModalExport';

const meta: Meta<typeof ModalExport> = {
  argTypes: {},
  component: ModalExport,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalExport',
};

export default meta;
type Story = StoryObj<typeof ModalExport>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
