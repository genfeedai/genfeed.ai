import type { Meta, StoryObj } from '@storybook/nextjs';
import Pagination from '@ui/navigation/pagination/Pagination';
import { useState } from 'react';

/**
 * Pagination component for navigating through pages of content.
 * Supports both controlled and URL-based pagination.
 */
const meta = {
  argTypes: {
    currentPage: {
      control: 'number',
      description: 'Currently active page number',
    },
    totalPages: {
      control: 'number',
      description: 'Total number of pages',
    },
  },
  component: Pagination,
  parameters: {
    docs: {
      description: {
        component:
          'Pagination component for navigating through multiple pages. Can work with onPageChange callback or Next.js Link-based navigation.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/UI/Pagination',
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Basic pagination with 5 pages
 */
export const Basic: Story = {
  args: {
    currentPage: 1,
    totalPages: 5,
  },
  render: () => {
    const [currentPage, setCurrentPage] = useState(1);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={5}
        onPageChange={setCurrentPage}
      />
    );
  },
};

/**
 * Pagination with many pages
 */
export const ManyPages: Story = {
  args: {
    currentPage: 1,
    totalPages: 10,
  },
  render: () => {
    const [currentPage, setCurrentPage] = useState(1);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={10}
        onPageChange={setCurrentPage}
      />
    );
  },
};

/**
 * Pagination on first page
 */
export const FirstPage: Story = {
  args: {
    currentPage: 1,
    totalPages: 10,
  },
  render: () => {
    const [currentPage, setCurrentPage] = useState(1);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={10}
        onPageChange={setCurrentPage}
      />
    );
  },
};

/**
 * Pagination on last page
 */
export const LastPage: Story = {
  args: {
    currentPage: 10,
    totalPages: 10,
  },
  render: () => {
    const [currentPage, setCurrentPage] = useState(10);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={10}
        onPageChange={setCurrentPage}
      />
    );
  },
};

/**
 * Pagination on middle page
 */
export const MiddlePage: Story = {
  args: {
    currentPage: 5,
    totalPages: 10,
  },
  render: () => {
    const [currentPage, setCurrentPage] = useState(5);
    return (
      <Pagination
        currentPage={currentPage}
        totalPages={10}
        onPageChange={setCurrentPage}
      />
    );
  },
};

/**
 * Single page (pagination hidden)
 */
export const SinglePage: Story = {
  args: {
    currentPage: 1,
    totalPages: 1,
  },
  render: () => {
    const [currentPage, setCurrentPage] = useState(1);
    return (
      <div>
        <p className="text-sm text-foreground/70 mb-4">
          When totalPages = 1, pagination is hidden
        </p>
        <Pagination
          currentPage={currentPage}
          totalPages={1}
          onPageChange={setCurrentPage}
        />
      </div>
    );
  },
};

/**
 * With content and page info
 */
export const WithContent: Story = {
  args: {
    currentPage: 1,
    totalPages: 5,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [currentPage, setCurrentPage] = useState(1);
    const totalPages = 5;
    const itemsPerPage = 10;
    const totalItems = 47;

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return (
      <div className="space-y-6 w-full max-w-2xl">
        <div className=" border border-white/[0.08] bg-background p-6">
          <h3 className="font-bold text-lg mb-4">Page {currentPage} Content</h3>
          <p className="text-foreground/70">
            This is the content for page {currentPage}.
          </p>
          <div className="mt-4 space-y-2">
            {Array.from({ length: itemsPerPage }, (_, i) => {
              const itemNumber = startItem + i;
              if (itemNumber > totalItems) {
                return null;
              }
              return (
                <div key={i} className="p-2 bg-card">
                  Item #{itemNumber}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-foreground/70">
            Showing {startItem}-{endItem} of {totalItems}
          </span>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    );
  },
};

/**
 * Interactive example
 */
export const Interactive: Story = {
  args: {
    currentPage: 1,
    totalPages: 13,
  },
  parameters: {
    layout: 'padded',
  },
  render: () => {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const totalItems = 127;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return (
      <div className="space-y-6 w-full max-w-2xl">
        <div className="flex justify-between items-center">
          <div className="text-sm">
            <span className="text-foreground/70">Items per page:</span>
            <select
              className="h-8 border border-input bg-transparent px-3 text-sm ml-2"
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <span className="text-sm text-foreground/70">
            Showing {startItem}-{endItem} of {totalItems}
          </span>
        </div>

        <div className=" border border-white/[0.08] bg-background p-6 min-h-96">
          <h3 className="font-bold text-lg mb-4">
            Page {currentPage} of {totalPages}
          </h3>
          <div className="space-y-2">
            {Array.from({ length: itemsPerPage }, (_, i) => {
              const itemNumber = startItem + i;
              if (itemNumber > totalItems) {
                return null;
              }
              return (
                <div key={i} className="p-3 bg-card flex justify-between">
                  <span>Item #{itemNumber}</span>
                  <span className="text-foreground/70">Page {currentPage}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    );
  },
};
