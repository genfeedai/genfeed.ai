import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalGenerateIllustration from '@ui/modals/content/generate-illustration/ModalGenerateIllustration';

const meta: Meta<typeof ModalGenerateIllustration> = {
  component: ModalGenerateIllustration,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Modals/ModalGenerateIllustration',
};

export default meta;
type Story = StoryObj<typeof ModalGenerateIllustration>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
