import type { PresetElementSchema } from '@genfeedai/client/schemas';
import { ModelCategory } from '@genfeedai/contracts';
import type { IPreset } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalPreset from '@ui/modals/elements/preset/ModalPreset';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ui from '../../../../../../../apps/app/messages/en/ui.json';

const fixture = vi.hoisted(() => ({
  transform: null as ((data: PresetElementSchema) => unknown) | null,
  values: null as (() => PresetElementSchema) | null,
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'current-org', brandId: 'current-brand' }),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));
vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ subscribe: vi.fn() }),
}));
vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: vi.fn() }) },
}));
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: import('react').PropsWithChildren) => (
    <div>{children}</div>
  ),
}));
vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: import('react').PropsWithChildren) => (
    <div>{children}</div>
  ),
}));
vi.mock('@genfeedai/hooks/ui/use-crud-modal/use-crud-modal', async () => {
  const { useForm } = await import('react-hook-form');
  return {
    useCrudModal: (
      options: Parameters<
        typeof import('@genfeedai/hooks/ui/use-crud-modal/use-crud-modal').useCrudModal<
          IPreset,
          PresetElementSchema
        >
      >[0],
    ) => {
      const form = useForm<PresetElementSchema>({
        defaultValues: { ...options.defaultValues, ...options.entity },
      });
      fixture.transform = options.transformSubmitData ?? null;
      fixture.values = form.getValues;
      return {
        form,
        formRef: { current: null },
        isSubmitting: false,
        onSubmit: vi.fn(),
        closeModal: vi.fn(),
      };
    },
  };
});

function renderPreset(element: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ui }}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe('ModalPreset', () => {
  beforeEach(() => {
    fixture.transform = null;
    fixture.values = null;
  });
  const input = {
    category: ModelCategory.IMAGE,
    isActive: true,
    key: 'studio-banner',
    label: 'Banner',
  };
  it.each([
    { organizationId: null, brandId: null },
    { organizationId: 'own-org', brandId: null },
    { organizationId: 'own-org', brandId: 'own-brand' },
  ])(
    'preserves existing preset ownership in another brand context: %j',
    (scope) => {
      renderPreset(
        <ModalPreset
          item={{ ...input, ...scope, id: 'preset-1' } as IPreset}
          onConfirm={vi.fn()}
        />,
      );
      expect(
        fixture.transform?.({
          ...input,
          organizationId: 'current-org',
          brandId: 'current-brand',
        }),
      ).toEqual({
        ...input,
        ...(scope.organizationId
          ? { organizationId: scope.organizationId }
          : {}),
        ...(scope.brandId ? { brandId: scope.brandId } : {}),
      });
    },
  );
  it('scopes newly created presets to the current organization and brand', () => {
    renderPreset(<ModalPreset onConfirm={vi.fn()} />);
    expect(fixture.transform?.(input)).toMatchObject({
      organizationId: 'current-org',
      brandId: 'current-brand',
    });
  });
  it('edits the generation prompt, duration and activation using the shared controls', () => {
    renderPreset(
      <ModalPreset
        item={
          {
            ...input,
            id: 'preset-1',
            prompt: 'Original',
            duration: 5,
          } as IPreset
        }
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Generation prompt')).toHaveValue('Original');
    fireEvent.change(screen.getByLabelText('Generation prompt'), {
      target: { value: 'Edited prompt' },
    });
    fireEvent.change(screen.getByLabelText('Video duration (seconds)'), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Active' }));
    expect(fixture.values?.()).toMatchObject({
      prompt: 'Edited prompt',
      duration: 8,
      isActive: false,
    });
    fireEvent.change(screen.getByLabelText('Video duration (seconds)'), {
      target: { value: '' },
    });
    expect(fixture.values?.().duration).toBeUndefined();
  });
});
