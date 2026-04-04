import { ButtonVariant } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import Button from '@ui/buttons/base/Button';
import Modal from '@ui/modals/modal/Modal';
import { useState } from 'react';

/**
 * Modal component provides a dialog overlay for displaying content.
 * Supports full-screen mode, error states, and custom styling.
 */
const meta = {
  argTypes: {
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    id: {
      control: 'text',
      description: 'Unique modal ID',
    },
    isError: {
      control: 'boolean',
      description: 'Error state styling',
    },
    isFullScreen: {
      control: 'boolean',
      description: 'Full screen modal',
    },
    onClose: {
      action: 'closed',
      description: 'Callback when modal closes',
    },
    showCloseButton: {
      control: 'boolean',
      description: 'Show close button',
    },
    title: {
      control: 'text',
      description: 'Modal title',
    },
  },
  component: Modal,
  parameters: {
    docs: {
      description: {
        component:
          'Modal dialog component with backdrop blur, close button, and error state support.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Modals/Modal',
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default modal
 */
export const Default: Story = {
  args: { children: <></>, id: 'modal', title: 'Modal' },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button label="Open Modal" onClick={() => setIsOpen(true)} />
        {isOpen && (
          <Modal
            id="default-modal"
            title="Default Modal"
            onClose={() => setIsOpen(false)}
          >
            <p>This is a default modal with some content.</p>
          </Modal>
        )}
      </>
    );
  },
};

/**
 * Modal with title
 */
export const WithTitle: Story = {
  args: {
    children: <></>,
    id: 'modal',
    title: 'Modal',
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button label="Open Modal" onClick={() => setIsOpen(true)} />
        {isOpen && (
          <Modal
            id="title-modal"
            title="Modal Title"
            onClose={() => setIsOpen(false)}
          >
            <div className="space-y-4">
              <p>This modal has a title.</p>
              <Button label="Close" onClick={() => setIsOpen(false)} />
            </div>
          </Modal>
        )}
      </>
    );
  },
};

/**
 * Error modal
 */
export const Error: Story = {
  args: { children: <></>, id: 'modal', title: 'Modal' },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button label="Open Error Modal" onClick={() => setIsOpen(true)} />
        {isOpen && (
          <Modal
            id="error-modal"
            title="Error"
            isError={true}
            error="Something went wrong!"
            onClose={() => setIsOpen(false)}
          >
            <p>This is an error modal with error styling.</p>
          </Modal>
        )}
      </>
    );
  },
};

/**
 * Full screen modal
 */
export const FullScreen: Story = {
  args: { children: <></>, id: 'modal', title: 'Modal' },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button
          label="Open Full Screen Modal"
          onClick={() => setIsOpen(true)}
        />
        {isOpen && (
          <Modal
            id="fullscreen-modal"
            title="Full Screen Modal"
            isFullScreen={true}
            onClose={() => setIsOpen(false)}
          >
            <div className="space-y-4">
              <p>This modal takes up most of the screen.</p>
              <div className="h-64 bg-background flex items-center justify-center">
                Large content area
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  },
};

/**
 * Modal without close button
 */
export const NoCloseButton: Story = {
  args: { children: <></>, id: 'modal', title: 'Modal' },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button label="Open Modal" onClick={() => setIsOpen(true)} />
        {isOpen && (
          <Modal
            id="no-close-modal"
            title="No Close Button"
            showCloseButton={false}
            onClose={() => setIsOpen(false)}
          >
            <div className="space-y-4">
              <p>This modal doesn&apos;t have a close button in the header.</p>
              <Button label="Close" onClick={() => setIsOpen(false)} />
            </div>
          </Modal>
        )}
      </>
    );
  },
};

/**
 * Modal with form content
 */
export const WithForm: Story = {
  args: { children: <></>, id: 'modal', title: 'Modal' },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <Button label="Open Form Modal" onClick={() => setIsOpen(true)} />
        {isOpen && (
          <Modal
            id="form-modal"
            title="Create Item"
            onClose={() => setIsOpen(false)}
          >
            <form className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <input
                  type="text"
                  className="h-10 border border-input px-3 w-full"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Description
                </label>
                <textarea className="border border-input px-3 py-2 w-full" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button label="Cancel" onClick={() => setIsOpen(false)} />
                <Button label="Submit" variant={ButtonVariant.DEFAULT} />
              </div>
            </form>
          </Modal>
        )}
      </>
    );
  },
};
