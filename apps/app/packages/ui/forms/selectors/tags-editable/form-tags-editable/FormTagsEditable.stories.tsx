import type { Meta, StoryObj } from '@storybook/nextjs';
import FormTagsEditable from '@ui/forms/selectors/tags-editable/form-tags-editable/FormTagsEditable';

const meta: Meta<typeof FormTagsEditable> = {
  argTypes: {},
  component: FormTagsEditable,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Forms/FormTagsEditable',
};

export default meta;
type Story = StoryObj<typeof FormTagsEditable>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
