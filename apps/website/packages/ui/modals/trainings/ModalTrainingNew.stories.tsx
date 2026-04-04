import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalTrainingNew from '@ui/modals/trainings/ModalTrainingNew';

const meta: Meta<typeof ModalTrainingNew> = {
  argTypes: {},
  component: ModalTrainingNew,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalTrainingNew',
};

export default meta;
type Story = StoryObj<typeof ModalTrainingNew>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
