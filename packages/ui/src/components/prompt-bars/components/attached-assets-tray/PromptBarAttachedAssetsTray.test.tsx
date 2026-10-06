import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarAttachedAssetsTray from '@ui/prompt-bars/components/attached-assets-tray/PromptBarAttachedAssetsTray';
import { describe, expect, it, vi } from 'vitest';

const asset: PromptBarAttachedAsset = {
  id: 'reference-1',
  name: 'Apple',
  kind: 'image',
  role: 'reference',
  source: 'library',
};

describe('PromptBarAttachedAssetsTray', () => {
  it('renders and removes an extension reference without an intl provider', () => {
    const remove = vi.fn();
    render(
      <PromptBarAttachedAssetsTray
        assets={[asset]}
        onRemoveAttachedAsset={remove}
      />,
    );
    expect(
      screen.getByRole('group', { name: 'Reference: Apple' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Apple' }));
    expect(remove).toHaveBeenCalledWith('reference-1');
  });

  it('uses the host translator for video reference roles and actions', () => {
    render(
      <PromptBarAttachedAssetsTray
        assets={[{ ...asset, role: 'videoReference', kind: 'video' }]}
        onRemoveAttachedAsset={vi.fn()}
        translate={(key, values) => {
          if (key === 'videoReference') return 'Référence vidéo';
          if (key === 'assetGroup') return `${values?.role}: ${values?.name}`;
          if (key === 'removeAsset') return `Supprimer ${values?.name}`;
          return key;
        }}
      />,
    );
    expect(
      screen.getByRole('group', { name: 'Référence vidéo: Apple' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Supprimer Apple' }),
    ).toBeInTheDocument();
  });
});
