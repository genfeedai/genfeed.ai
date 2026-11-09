import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandFontsCard from './BrandFontsCard';

const { list, upload, remove, file, getService } = vi.hoisted(() => {
  const service = {
    file: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    upload: vi.fn(),
  };
  // One stable getter, like the real hook, so effects do not rerun per render.
  return { ...service, getService: async () => service };
});
vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@services/social/brand-font-assets.service', () => ({
  BrandFontAssetsService: { getInstance: vi.fn() },
}));

const font = {
  brandId: 'brand-1',
  category: 'FONT',
  contentHash: `sha256:${'a'.repeat(64)}`,
  createdAt: '2026-11-09T00:00:00.000Z',
  displayName: null,
  id: 'font-1',
  isDeleted: false,
  mimeType: 'font/woff2',
  originalFileName: 'Acme-Display.woff2',
  sizeBytes: 2048,
  updatedAt: '2026-11-09T00:00:00.000Z',
};

function choose(name: string, size = 2048) {
  fireEvent.change(screen.getByLabelText('upload'), {
    target: { files: [new File([new Uint8Array(size)], name)] },
  });
}

describe('BrandFontsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ items: [font], nextCursor: null });
    file.mockRejectedValue(new Error('no font loading in tests'));
  });

  it('lists the uploaded fonts with a sample line', async () => {
    render(<BrandFontsCard brandId="brand-1" isManager />);

    expect(await screen.findByText('Acme-Display.woff2')).toBeInTheDocument();
    expect(screen.getByText('sample')).toBeInTheDocument();
  });

  it('explains how to supply a TTF font instead of uploading it', async () => {
    render(<BrandFontsCard brandId="brand-1" isManager />);
    await screen.findByText('Acme-Display.woff2');

    choose('Acme.ttf');

    expect(screen.getByRole('alert')).toHaveTextContent('notWoff2');
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads a WOFF2 font and shows it in the list', async () => {
    upload.mockResolvedValue(font);
    list
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValue({ items: [font], nextCursor: null });
    render(<BrandFontsCard brandId="brand-1" isManager />);
    expect(await screen.findByText('empty')).toBeInTheDocument();

    choose('Acme-Display.woff2');

    expect(await screen.findByRole('status')).toHaveTextContent('uploaded');
    expect(await screen.findByText('Acme-Display.woff2')).toBeInTheDocument();
  });

  it('hides upload and remove from a member who cannot manage the brand', async () => {
    render(<BrandFontsCard brandId="brand-1" isManager={false} />);

    expect(await screen.findByText('Acme-Display.woff2')).toBeInTheDocument();
    expect(screen.queryByLabelText('upload')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
