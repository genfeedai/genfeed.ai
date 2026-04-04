import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalMetadata from '@ui/modals/content/metadata/ModalMetadata';

const meta: Meta<typeof ModalMetadata> = {
  argTypes: {},
  component: ModalMetadata,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalMetadata',
};

export default meta;
type Story = StoryObj<typeof ModalMetadata>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
