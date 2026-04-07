import type { Meta, StoryObj } from '@storybook/nextjs';
import RichTextEditor from '@ui/editors/RichTextEditor';

const meta: Meta<typeof RichTextEditor> = {
  argTypes: {},
  component: RichTextEditor,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Editors/RichTextEditor',
};

export default meta;
type Story = StoryObj<typeof RichTextEditor>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
