import type { Meta, StoryObj } from '@storybook/nextjs';
import FiltersButton from '@ui/content/filters-button/FiltersButton';

const meta: Meta<typeof FiltersButton> = {
  argTypes: {},
  component: FiltersButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/FiltersButton',
};

export default meta;
type Story = StoryObj<typeof FiltersButton>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
