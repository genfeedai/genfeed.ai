import { render, screen } from '@testing-library/react';
import { CloudViewportGuard } from '@workflow-cloud/components/editor/CloudViewportGuard';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/workflow-ui', () => ({
  SmallGraphViewportGuard: () => <div>Shared Viewport Guard</div>,
}));

describe('CloudViewportGuard', () => {
  it('delegates to the shared workflow-ui viewport guard', () => {
    render(<CloudViewportGuard />);

    expect(screen.getByText('Shared Viewport Guard')).toBeTruthy();
  });
});
