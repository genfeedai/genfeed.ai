import { render, screen } from '@testing-library/react';
import ModalGalleryHeader from '@ui/modals/gallery/ModalGalleryHeader';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@genfeedai/providers/global-modals/global-modals.provider', () => ({
  useUploadModal: () => ({
    openUpload: vi.fn(),
  }),
}));

vi.mock('@genfeedai/helpers/data/data/data.helper', () => ({
  formatVideos: [
    { id: 'portrait', label: 'Portrait (9:16)' },
    { id: 'landscape', label: 'Landscape (16:9)' },
    { id: 'square', label: 'Square (1:1)' },
  ],
}));

vi.mock('@ui/navigation/tabs/Tabs', () => ({
  default: ({ tabs, activeTab, onTabChange }: any) => (
    <div data-testid="tabs">
      {tabs.map((tab: any) => (
        <button key={tab.id} onClick={() => onTabChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: ({ children }: any) => <div data-testid="alert">{children}</div>,
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label, onClick }: any) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));

describe('ModalGalleryHeader', () => {
  const defaultProps = {
    accountReference: null,
    activeTab: 'media' as const,
    category: 'image' as const,
    filterReferenceId: '',
    localFormat: 'portrait' as const,
    onClearFilter: vi.fn(),
    onReloadItems: vi.fn(),
    onTabChange: vi.fn(),
    onUseAccountReference: vi.fn(),
    tabs: [
      { id: 'media', label: 'Images' },
      { id: 'references', label: 'Branding' },
    ],
  };

  it('renders tabs for image category', () => {
    render(<ModalGalleryHeader {...defaultProps} />);
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Branding')).toBeInTheDocument();
  });

  it('renders account reference section when provided', () => {
    const accountRef = { id: 'ref-1', url: 'http://example.com/ref.jpg' };
    render(
      <ModalGalleryHeader {...defaultProps} accountReference={accountRef} />,
    );
    expect(screen.getByText('Use Account Reference')).toBeInTheDocument();
  });

  it('renders format badge for references tab', () => {
    render(<ModalGalleryHeader {...defaultProps} activeTab="references" />);
    // Component shows format as a badge, not a selector
    expect(screen.getByText(/Format:/)).toBeInTheDocument();
    expect(screen.getByText(/Portrait/)).toBeInTheDocument();
  });

  it('renders format badge for media tab', () => {
    render(<ModalGalleryHeader {...defaultProps} activeTab="media" />);
    expect(screen.getByText(/Format:/)).toBeInTheDocument();
  });

  it('renders upload button', () => {
    render(<ModalGalleryHeader {...defaultProps} />);
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('renders format info alert', () => {
    render(<ModalGalleryHeader {...defaultProps} activeTab="media" />);
    expect(screen.getByTestId('alert')).toBeInTheDocument();
  });

  it('renders filter badge when filterReferenceId is provided', () => {
    render(<ModalGalleryHeader {...defaultProps} filterReferenceId="ref-1" />);
    expect(screen.getByText('Filtered by references')).toBeInTheDocument();
  });
});
