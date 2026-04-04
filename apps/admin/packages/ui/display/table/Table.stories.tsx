import type { IUser } from '@genfeedai/interfaces';
import type { Meta, StoryObj } from '@storybook/nextjs';
import AppTable from '@ui/display/table/Table';
import { useState } from 'react';
import { HiEye, HiPencil, HiTrash } from 'react-icons/hi2';

/**
 * AppTable component for displaying tabular data with sorting, selection, and actions.
 * Generic component that works with any data type.
 */
const meta = {
  component: AppTable,
  parameters: {
    docs: {
      description: {
        component:
          'Flexible table component with support for row selection, custom actions, loading states, and empty states.',
      },
    },
    layout: 'padded',
  },
  tags: ['autodocs'],
  title: 'Components/UI/Table',
} satisfies Meta<typeof AppTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleUsers: IUser[] = [
  {
    avatar: '',
    clerkId: 'clerk-1',
    createdAt: new Date().toISOString(),
    email: 'john@example.com',
    firstName: 'John',
    handle: 'johndoe',
    id: '1',
    isDeleted: false,
    lastName: 'Doe',
    role: 'Admin',
    settings: {
      createdAt: new Date().toISOString(),
      id: 'settings-1',
      isAdvancedMode: false,
      isDeleted: false,
      isFirstLogin: false,
      isMenuCollapsed: false,
      isVerified: true,
      theme: 'light',
      updatedAt: new Date().toISOString(),
    },
    status: 'active',
    updatedAt: new Date().toISOString(),
  } as IUser & { role: string; status: string },
  {
    avatar: '',
    clerkId: 'clerk-2',
    createdAt: new Date().toISOString(),
    email: 'jane@example.com',
    firstName: 'Jane',
    handle: 'janesmith',
    id: '2',
    isDeleted: false,
    lastName: 'Smith',
    role: 'Editor',
    settings: {
      createdAt: new Date().toISOString(),
      id: 'settings-2',
      isAdvancedMode: false,
      isDeleted: false,
      isFirstLogin: false,
      isMenuCollapsed: false,
      isVerified: true,
      theme: 'light',
      updatedAt: new Date().toISOString(),
    },
    status: 'active',
    updatedAt: new Date().toISOString(),
  } as IUser & { role: string; status: string },
  {
    avatar: '',
    clerkId: 'clerk-3',
    createdAt: new Date().toISOString(),
    email: 'bob@example.com',
    firstName: 'Bob',
    handle: 'bobjohnson',
    id: '3',
    isDeleted: false,
    lastName: 'Johnson',
    role: 'Viewer',
    settings: {
      createdAt: new Date().toISOString(),
      id: 'settings-3',
      isAdvancedMode: false,
      isDeleted: false,
      isFirstLogin: false,
      isMenuCollapsed: false,
      isVerified: true,
      theme: 'light',
      updatedAt: new Date().toISOString(),
    },
    status: 'inactive',
    updatedAt: new Date().toISOString(),
  } as IUser & { role: string; status: string },
  {
    avatar: '',
    clerkId: 'clerk-4',
    createdAt: new Date().toISOString(),
    email: 'alice@example.com',
    firstName: 'Alice',
    handle: 'alicewilliams',
    id: '4',
    isDeleted: false,
    lastName: 'Williams',
    settings: {
      createdAt: new Date().toISOString(),
      id: 'settings-4',
      isAdvancedMode: false,
      isDeleted: false,
      isFirstLogin: false,
      isMenuCollapsed: false,
      isVerified: true,
      theme: 'light',
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  } as IUser,
  {
    avatar: '',
    clerkId: 'clerk-5',
    createdAt: new Date().toISOString(),
    email: 'charlie@example.com',
    firstName: 'Charlie',
    handle: 'charliebrown',
    id: '5',
    isDeleted: false,
    lastName: 'Brown',
    role: 'Viewer',
    settings: {
      createdAt: new Date().toISOString(),
      id: 'settings-5',
      isAdvancedMode: false,
      isDeleted: false,
      isFirstLogin: false,
      isMenuCollapsed: false,
      isVerified: true,
      theme: 'light',
      updatedAt: new Date().toISOString(),
    },
    status: 'active',
    updatedAt: new Date().toISOString(),
  } as IUser & { role: string; status: string },
];

/**
 * Basic table with simple columns
 */
export const Basic: Story = {
  args: {
    columns: [
      { header: 'Name', key: 'name' },
      { header: 'Email', key: 'email' },
      { header: 'Role', key: 'role' },
    ],
    getRowKey: (user, _index) => {
      void _index; // index is required by signature but unused
      return (user as IUser).id;
    },
    items: sampleUsers,
  },
};

/**
 * Table with custom cell rendering
 */
export const CustomRendering: Story = {
  args: {
    columns: [],
    items: [],
  },
  render: () => (
    <AppTable
      items={sampleUsers}
      columns={[
        {
          header: 'Name',
          key: 'name',
          render: (user: IUser) => (
            <div className="font-semibold text-foreground">
              {user.firstName} {user.lastName}
            </div>
          ),
        },
        {
          header: 'Email',
          key: 'email',
          render: (user: IUser) => (
            <a
              href={`mailto:${user.email}`}
              className="text-primary hover:underline"
            >
              {user.email}
            </a>
          ),
        },
        {
          header: 'Role',
          key: 'role',
        },
        {
          header: 'Status',
          key: 'status',
        },
      ]}
      getRowKey={(user: IUser) => user.id}
    />
  ),
};

/**
 * Table with row actions
 */
export const WithActions: Story = {
  args: {
    columns: [],
    items: [],
  },
  render: () => (
    <AppTable
      items={sampleUsers}
      columns={[
        { header: 'Name', key: 'name' },
        { header: 'Email', key: 'email' },
        { header: 'Role', key: 'role' },
      ]}
      actions={[
        {
          className: 'hover:bg-accent hover:text-accent-foreground',
          icon: <HiEye />,
          onClick: (user: IUser) =>
            alert(`View ${user.firstName} ${user.lastName}`),
          tooltip: 'View details',
        },
        {
          className: 'hover:bg-accent hover:text-accent-foreground',
          icon: <HiPencil />,
          onClick: (user: IUser) =>
            alert(`Edit ${user.firstName} ${user.lastName}`),
          tooltip: 'Edit user',
        },
        {
          className: 'hover:bg-accent hover:text-accent-foreground text-error',
          icon: <HiTrash />,
          onClick: (user: IUser) =>
            alert(`Delete ${user.firstName} ${user.lastName}`),
          tooltip: 'Delete user',
        },
      ]}
      getRowKey={(user: IUser) => user.id}
    />
  ),
};

/**
 * Table with row selection
 */
export const Selectable: Story = {
  args: {
    columns: [],
    items: [],
  },
  render: () => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    return (
      <div className="space-y-4">
        <div className="text-sm text-foreground/70">
          Selected: {selectedIds.length} items
        </div>
        <AppTable
          items={sampleUsers}
          columns={[
            { header: 'Name', key: 'name' },
            { header: 'Email', key: 'email' },
            { header: 'Role', key: 'role' },
          ]}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          getItemId={(user) => user.id}
          getRowKey={(user: IUser) => user.id}
        />
      </div>
    );
  },
};

/**
 * Loading state
 */
export const Loading: Story = {
  args: {
    columns: [
      { header: 'Name', key: 'name' },
      { header: 'Email', key: 'email' },
      { header: 'Role', key: 'role' },
      { header: 'Status', key: 'status' },
    ],
    isLoading: true,
    items: [],
  },
};

/**
 * Empty state
 */
export const Empty: Story = {
  args: {
    columns: [
      { header: 'Name', key: 'name' },
      { header: 'Email', key: 'email' },
      { header: 'Role', key: 'role' },
    ],
    emptyLabel: 'No users found',
    items: [],
  },
};

/**
 * Table with custom column widths
 */
export const CustomColumnWidths: Story = {
  args: {
    columns: [
      { className: 'min-w-56', header: 'Name', key: 'name' },
      { className: 'min-w-56', header: 'Email', key: 'email' },
      { className: 'min-w-32', header: 'Role', key: 'role' },
      { className: 'min-w-32', header: 'Status', key: 'status' },
    ],
    items: sampleUsers,
  },
};

/**
 * Table with custom row styling
 */
export const CustomRowStyling: Story = {
  args: {
    columns: [],
    items: [],
  },
  render: () => (
    <AppTable
      items={sampleUsers}
      columns={[
        { header: 'Name', key: 'name' },
        { header: 'Email', key: 'email' },
        { header: 'Role', key: 'role' },
        {
          header: 'Status',
          key: 'status',
          render: (user: IUser) => (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold ${
                user.isDeleted
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-success text-success-foreground'
              }`}
            >
              {user.isDeleted ? 'Deleted' : 'Active'}
            </span>
          ),
        },
      ]}
      getRowKey={(user: IUser) => (user as IUser).id}
    />
  ),
};

/**
 * Full featured table
 */
export const FullFeatured: Story = {
  args: {
    columns: [],
    items: [],
  },
  render: () => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-foreground/70">
            {selectedIds.length > 0 ? (
              <span>{selectedIds.length} items selected</span>
            ) : (
              <span>{sampleUsers.length} total users</span>
            )}
          </div>
          {selectedIds.length > 0 && (
            <div className="flex gap-2">
              <button
                className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                onClick={() => alert(`Delete ${selectedIds.length} users`)}
              >
                Delete Selected
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs hover:bg-accent hover:text-accent-foreground"
                onClick={() => setSelectedIds([])}
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>
        <AppTable
          items={sampleUsers}
          columns={[
            {
              className: 'min-w-56',
              header: 'Name',
              key: 'name',
              render: (user: IUser) => (
                <div className="font-semibold">
                  {user.firstName} {user.lastName}
                </div>
              ),
            },
            {
              className: 'min-w-56',
              header: 'Email',
              key: 'email',
              render: (user: IUser) => (
                <a
                  href={`mailto:${user.email}`}
                  className="text-primary hover:underline"
                >
                  {user.email}
                </a>
              ),
            },
            {
              className: 'min-w-32',
              header: 'Status',
              key: 'status',
              render: (user: IUser) => (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold ${
                    user.isDeleted
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-success text-success-foreground'
                  }`}
                >
                  {user.isDeleted ? 'Deleted' : 'Active'}
                </span>
              ),
            },
          ]}
          actions={[
            {
              className: 'hover:bg-accent hover:text-accent-foreground',
              icon: <HiEye />,
              onClick: (user: IUser) =>
                alert(`View ${user.firstName} ${user.lastName}`),
              tooltip: 'View details',
            },
            {
              className: 'hover:bg-accent hover:text-accent-foreground',
              icon: <HiPencil />,
              onClick: (user: IUser) =>
                alert(`Edit ${user.firstName} ${user.lastName}`),
              tooltip: 'Edit user',
            },
            {
              className:
                'hover:bg-accent hover:text-accent-foreground text-error',
              icon: <HiTrash />,
              onClick: (user: IUser) =>
                alert(`Delete ${user.firstName} ${user.lastName}`),
              tooltip: 'Delete user',
            },
          ]}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          getItemId={(user) => user.id}
          getRowKey={(user: IUser) => (user as IUser).id}
        />
      </div>
    );
  },
};
