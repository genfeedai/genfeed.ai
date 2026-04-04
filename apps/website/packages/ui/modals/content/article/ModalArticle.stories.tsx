import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalArticle from '@ui/modals/content/article/ModalArticle';

const meta: Meta<typeof ModalArticle> = {
  argTypes: {},
  component: ModalArticle,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalArticle',
};

export default meta;
type Story = StoryObj<typeof ModalArticle>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
