import type { Meta, StoryObj } from '@storybook/nextjs';
import EvaluationCard from '@ui/evaluation/card/EvaluationCard';

const meta: Meta<typeof EvaluationCard> = {
  argTypes: {},
  component: EvaluationCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Evaluation/EvaluationCard',
};

export default meta;
type Story = StoryObj<typeof EvaluationCard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
