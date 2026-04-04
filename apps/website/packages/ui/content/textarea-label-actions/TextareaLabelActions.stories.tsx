import type { Meta, StoryObj } from '@storybook/nextjs';
import TextareaLabelActions from '@ui/content/textarea-label-actions/TextareaLabelActions';

const meta: Meta<typeof TextareaLabelActions> = {
  argTypes: {},
  component: TextareaLabelActions,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Ui/TextareaLabelActions',
};

export default meta;
type Story = StoryObj<typeof TextareaLabelActions>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
