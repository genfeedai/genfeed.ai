import { ModalEnum } from '@genfeedai/contracts';
import type { BaseService } from '@genfeedai/services/core/base.service';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ElementCreateModal from '@/components/modals/elements/shared/ElementCreateModal';

interface ElementCreationCase
  extends Pick<ComponentProps<typeof ElementCreateModal>, 'modalId'> {
  title: string;
  service: string;
}

interface ElementCreationRequest {
  service: string;
  body: unknown;
}

interface ElementCreationFixture {
  posted: ElementCreationRequest[];
  closed: string[];
  notifications: string[];
  isFailing: boolean;
  pendingPost: Promise<void>;
}

const fixture = vi.hoisted(
  (): ElementCreationFixture => ({
    posted: [],
    closed: [],
    notifications: [],
    isFailing: false,
    pendingPost: Promise.resolve(),
  }),
);

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService:
    (factory: (token: string) => BaseService<unknown, unknown, unknown>) =>
    async () => ({
      post: async (body: unknown) => {
        fixture.posted.push({
          service: factory('test-token').constructor.name,
          body,
        });
        await fixture.pendingPost;
        if (fixture.isFailing) throw new Error('Creation failed');
        return { id: 'created-element' };
      },
    }),
}));
vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: (id: string) => fixture.closed.push(id),
}));
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({
    children,
    title,
  }: ComponentProps<typeof import('@ui/modals/modal/Modal').default>) => (
    <section role="dialog" aria-label={title}>
      {children}
    </section>
  ),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: (message: string) => fixture.notifications.push(message),
    }),
  },
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

async function fillElement() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
    target: { value: 'Studio shot' },
  });
  fireEvent.change(screen.getByPlaceholderText('lowercase-with-hyphens'), {
    target: { value: 'Studio Shot!@' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
    target: { value: 'Soft studio light' },
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled(),
  );
}

describe('element creation', () => {
  beforeEach(() => {
    fixture.posted = [];
    fixture.closed = [];
    fixture.notifications = [];
    fixture.isFailing = false;
    fixture.pendingPost = Promise.resolve();
  });

  it.each<ElementCreationCase>([
    {
      modalId: ModalEnum.CAMERA,
      title: 'Create Camera',
      service: 'CamerasService',
    },
    {
      modalId: ModalEnum.CAMERA_MOVEMENT,
      title: 'Create Camera Movement',
      service: 'CameraMovementsService',
    },
    { modalId: ModalEnum.LENS, title: 'Create Lens', service: 'LensesService' },
    {
      modalId: ModalEnum.LIGHTING,
      title: 'Create Lighting',
      service: 'LightingsService',
    },
    { modalId: ModalEnum.MOOD, title: 'Create Mood', service: 'MoodsService' },
    {
      modalId: ModalEnum.SCENE,
      title: 'Create Scene',
      service: 'ScenesService',
    },
  ])(
    'creates $modalId with its own service and platform defaults',
    async ({ modalId, title, service }) => {
      let isConfirmed = false;
      render(
        <ElementCreateModal
          modalId={modalId}
          onConfirm={() => {
            isConfirmed = true;
          }}
        />,
      );
      expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Active' })).toBeChecked();
      expect(screen.getByRole('spinbutton')).toHaveValue(0);
      await fillElement();
      expect(screen.getByPlaceholderText('lowercase-with-hyphens')).toHaveValue(
        'studio-shot',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(isConfirmed).toBe(true));
      expect(fixture.posted).toEqual([
        {
          service,
          body: {
            label: 'Studio shot',
            key: 'studio-shot',
            description: 'Soft studio light',
            isActive: true,
            sortOrder: 0,
          },
        },
      ]);
      expect(fixture.closed).toEqual([modalId]);
    },
  );

  it('creates a font family without platform-only fields or payload', async () => {
    let isConfirmed = false;
    render(
      <ElementCreateModal
        modalId={ModalEnum.FONT_FAMILY}
        onConfirm={() => {
          isConfirmed = true;
        }}
      />,
    );
    expect(
      screen.getByRole('dialog', { name: 'Create Font Family' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Active' })).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await fillElement();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(isConfirmed).toBe(true));
    expect(fixture.posted).toEqual([
      {
        service: 'FontFamiliesService',
        body: {
          label: 'Studio shot',
          key: 'studio-shot',
          description: 'Soft studio light',
        },
      },
    ]);
    expect(fixture.closed).toEqual([ModalEnum.FONT_FAMILY]);
  });

  it('saves the active toggle and clamps negative sort order to zero', async () => {
    render(
      <ElementCreateModal modalId={ModalEnum.MOOD} onConfirm={() => {}} />,
    );
    await fillElement();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Active' }));
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '-4' },
    });
    expect(screen.getByRole('spinbutton')).toHaveValue(0);
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(fixture.posted).toEqual([
        {
          service: 'MoodsService',
          body: {
            label: 'Studio shot',
            key: 'studio-shot',
            description: 'Soft studio light',
            isActive: false,
            sortOrder: 12,
          },
        },
      ]),
    );
  });

  it('labels the key and sort-order controls for assistive technology', () => {
    render(
      <ElementCreateModal modalId={ModalEnum.MOOD} onConfirm={() => {}} />,
    );
    expect(screen.getByRole('textbox', { name: 'Key' })).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Sort order' }),
    ).toBeInTheDocument();
  });

  it('cancels without creating or confirming an element', () => {
    let isConfirmed = false;
    render(
      <ElementCreateModal
        modalId={ModalEnum.MOOD}
        onConfirm={() => {
          isConfirmed = true;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.posted).toEqual([]);
    expect(fixture.closed).toEqual([ModalEnum.MOOD]);
    expect(isConfirmed).toBe(false);
  });

  it('keeps input available for retry after a failed creation', async () => {
    fixture.isFailing = true;
    render(
      <ElementCreateModal modalId={ModalEnum.MOOD} onConfirm={() => {}} />,
    );
    await fillElement();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(fixture.notifications).toEqual(['Failed to create']),
    );
    expect(fixture.closed).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue(
      'Studio shot',
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  it('disables submission while a creation is pending', async () => {
    const pending = Promise.withResolvers<void>();
    fixture.pendingPost = pending.promise;
    render(
      <ElementCreateModal modalId={ModalEnum.MOOD} onConfirm={() => {}} />,
    );
    await fillElement();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled(),
    );
    pending.resolve();
    await waitFor(() => expect(fixture.closed).toEqual([ModalEnum.MOOD]));
  });
});
