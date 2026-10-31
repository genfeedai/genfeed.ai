import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CopyCommandButton from './copy-command-button';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CopyCommandButton', () => {
  it('writes the exact command to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<CopyCommandButton command="npx @genfeedai/skills-pro install" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy install command' }),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'npx @genfeedai/skills-pro install',
      ),
    );
  });
});
