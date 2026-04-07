import type { Meta, StoryObj } from '@storybook/nextjs';
import * as LazyModals from '@ui/lazy/modal/LazyModal';

const meta: Meta = {
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Lazy/LazyModal',
};

export default meta;
type Story = StoryObj;

// Showcase all available lazy-loaded modals
export const AllModals: Story = {
  render: () => {
    const modalNames = Object.keys(LazyModals).filter((key) =>
      key.startsWith('LazyModal'),
    );
    return (
      <div className="p-8">
        <h2 className="text-2xl font-bold mb-4">Available Lazy Modals</h2>
        <ul className="list-disc list-inside space-y-2">
          {modalNames.map((name) => (
            <li key={name} className="font-mono text-sm">
              {name}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-gray-600">
          All modals are lazy-loaded using Next.js dynamic imports. Each modal
          requires specific props to render. See individual modal stories for
          usage examples.
        </p>
      </div>
    );
  },
};
