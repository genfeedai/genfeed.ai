import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandNode } from './BrandNode';

const mocks = vi.hoisted(() => ({
  brands: [
    { _id: 'brand-1', label: 'First Brand', logoUrl: null },
    {
      _id: 'brand-2',
      label: 'Second Brand',
      logoUrl: 'https://example.test/brand-2.png',
    },
  ],
  updateNodeData: vi.fn(),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  selectUpdateNodeData: (state: {
    updateNodeData: typeof mocks.updateNodeData;
  }) => state.updateNodeData,
  useWorkflowStore: (
    selector: (state: {
      updateNodeData: typeof mocks.updateNodeData;
    }) => unknown,
  ) => selector({ updateNodeData: mocks.updateNodeData }),
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <picture>
      <img alt={props.alt ?? ''} {...props} />
    </picture>
  ),
}));

vi.mock('@/features/workflows/stores/cloud-workflow-store', () => ({
  useCloudWorkflowStore: (
    selector: (state: {
      brands: typeof mocks.brands;
      isBrandsLoading: boolean;
    }) => unknown,
  ) => selector({ brands: mocks.brands, isBrandsLoading: false }),
}));

vi.mock('@/features/workflows/components/ui/badge', () => ({
  NodeBadge: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/features/workflows/components/ui/card', () => ({
  NodeCard: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  NodeHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

vi.mock('@/features/workflows/components/ui/inputs', () => ({
  NodeSelect: ({
    children,
    label,
    onChange,
    value,
  }: React.SelectHTMLAttributes<HTMLSelectElement> & {
    children?: ReactNode;
    label?: string;
  }) => (
    <label>
      {label}
      <select value={value} onChange={onChange}>
        <option value="">Choose a brand</option>
        {children}
      </select>
    </label>
  ),
}));

vi.mock('@/features/workflows/components/ui/status', () => ({
  HelpText: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

function renderBrandNode(data: Record<string, unknown> = {}) {
  return render(
    <BrandNode
      id="brand-node"
      data={data}
      selected={false}
      type="brand"
      zIndex={1}
      isConnectable
      dragging={false}
      deletable
      draggable
      selectable
      positionAbsoluteX={0}
      positionAbsoluteY={0}
    />,
  );
}

describe('BrandNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears resolved brand details when the selected brand changes or is removed', () => {
    renderBrandNode({
      brandId: 'brand-1',
      resolvedColors: {
        accent: '#333333',
        primary: '#111111',
        secondary: '#222222',
      },
      resolvedFonts: { body: 'Inter', heading: 'Geist' },
      resolvedHandle: 'first-brand',
      resolvedLabel: 'First Brand',
      resolvedModels: { image: 'image-model', video: 'video-model' },
      resolvedVoice: 'Direct and playful',
    });

    fireEvent.change(screen.getByLabelText('Select Brand'), {
      target: { value: 'brand-2' },
    });
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('brand-node', {
      brandId: 'brand-2',
      resolvedBrandId: 'brand-2',
      resolvedColors: null,
      resolvedFonts: null,
      resolvedHandle: null,
      resolvedLabel: 'Second Brand',
      resolvedLogoUrl: 'https://example.test/brand-2.png',
      resolvedModels: null,
      resolvedVoice: null,
    });

    fireEvent.change(screen.getByLabelText('Select Brand'), {
      target: { value: '' },
    });
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('brand-node', {
      brandId: null,
      resolvedBrandId: null,
      resolvedColors: null,
      resolvedFonts: null,
      resolvedHandle: null,
      resolvedLabel: null,
      resolvedLogoUrl: null,
      resolvedModels: null,
      resolvedVoice: null,
    });
  });
});
