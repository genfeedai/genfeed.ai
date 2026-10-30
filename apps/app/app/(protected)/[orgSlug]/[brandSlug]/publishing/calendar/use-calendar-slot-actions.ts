import { PostCategory } from '@genfeedai/contracts';
import { createArtifactEditorRoute } from '@genfeedai/contracts/constants';
import type { IPostingCadence } from '@genfeedai/contracts/interfaces';
import type { CalendarSlotActionsOptions } from '@props/publishing/content-calendar-controller.props';
import type { PostingCadencesService } from '@services/content/posting-cadences.service';
import { useCallback, useState } from 'react';
import { mutationErrorMessage } from '@/features/posts/release/release-mutation-runner';

export function useCalendarSlotActions({
  brandId,
  defaultCredentialId,
  dateRange,
  cadences,
  setCadences,
  setSlots,
  selectedSlot,
  setSelectedSlot,
  setSelectedReleaseId,
  getPostingCadencesService,
  notificationsService,
  push,
  href,
}: CalendarSlotActionsOptions) {
  const [editingCadence, setEditingCadence] = useState<IPostingCadence | null>(
    null,
  );
  const [isCadenceFormOpen, setIsCadenceFormOpen] = useState(false);
  const [isSlotPending, setIsSlotPending] = useState(false);
  const generateSlotByIdentity = useCallback(
    async (identityKey: string, brief?: string): Promise<void> => {
      setIsSlotPending(true);
      try {
        const service = await getPostingCadencesService();
        const filled = await service.generate({ brief, identityKey });
        setSlots((current) =>
          current.filter((slot) => slot.identityKey !== filled.identityKey),
        );
        setSelectedSlot((current) =>
          current?.identityKey === filled.identityKey ? null : current,
        );
        notificationsService.success('Slot generated.');
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    },
    [
      getPostingCadencesService,
      notificationsService,
      setSlots,
      setSelectedSlot,
    ],
  );

  const handleDateClick = useCallback(
    (start: Date) => {
      if (!brandId || !defaultCredentialId) {
        notificationsService.error('Connect a channel before booking a slot.');
        return;
      }

      void (async () => {
        try {
          const service = await getPostingCadencesService();
          const booked = await service.book({
            brandId,
            credentialId: defaultCredentialId,
            format: PostCategory.POST,
            instant: start.toISOString(),
          });
          setSlots((current) => [...current, booked]);
          setSelectedReleaseId(null);
          setSelectedSlot(booked);
        } catch (error) {
          notificationsService.error(mutationErrorMessage(error));
        }
      })();
    },
    [
      brandId,
      defaultCredentialId,
      getPostingCadencesService,
      notificationsService,
      setSelectedSlot,
      setSelectedReleaseId,
      setSlots,
    ],
  );

  const handleGenerateSlot = useCallback(
    (brief?: string) => {
      if (!selectedSlot) {
        return;
      }
      void generateSlotByIdentity(selectedSlot.identityKey, brief);
    },
    [generateSlotByIdentity, selectedSlot],
  );

  const handleWriteSlot = useCallback(() => {
    if (!selectedSlot) {
      return;
    }
    const format = selectedSlot.format;
    setIsSlotPending(true);
    void (async () => {
      try {
        const service = await getPostingCadencesService();
        const filled = await service.write(selectedSlot.identityKey);
        setSlots((current) =>
          current.filter((slot) => slot.identityKey !== filled.identityKey),
        );
        setSelectedSlot(null);
        if (filled.generatedItemId) {
          const kind = format === PostCategory.ARTICLE ? 'article' : 'post';
          push(href(createArtifactEditorRoute(kind, filled.generatedItemId)));
        }
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    })();
  }, [
    getPostingCadencesService,
    href,
    notificationsService,
    push,
    selectedSlot,
    setSelectedSlot,
    setSlots,
  ]);

  const handleSkipSlot = useCallback(() => {
    if (!selectedSlot) {
      return;
    }
    setIsSlotPending(true);
    void (async () => {
      try {
        const service = await getPostingCadencesService();
        const skipped = await service.skip(selectedSlot.identityKey);
        setSlots((current) =>
          current.filter((slot) => slot.identityKey !== skipped.identityKey),
        );
        setSelectedSlot(null);
        notificationsService.success('Slot skipped.');
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    })();
  }, [
    getPostingCadencesService,
    notificationsService,
    selectedSlot,
    setSlots,
    setSelectedSlot,
  ]);

  const handleCancelSlot = useCallback(() => {
    if (!selectedSlot) {
      return;
    }
    setIsSlotPending(true);
    void (async () => {
      try {
        const service = await getPostingCadencesService();
        const cancelled = await service.cancel(selectedSlot.identityKey);
        setSlots((current) =>
          current.map((slot) =>
            slot.identityKey === cancelled.identityKey ? cancelled : slot,
          ),
        );
        setSelectedSlot(null);
        notificationsService.success('Generation cancelled.');
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    })();
  }, [
    getPostingCadencesService,
    notificationsService,
    selectedSlot,
    setSlots,
    setSelectedSlot,
  ]);

  const handleCloseSlot = useCallback(() => {
    setSelectedSlot(null);
  }, [setSelectedSlot]);

  const handleEditCadence = useCallback(() => {
    if (!selectedSlot?.cadenceId) {
      return;
    }
    const cadence = cadences.find(
      (entry) => entry.id === selectedSlot.cadenceId,
    );
    if (!cadence) {
      notificationsService.error('That cadence could not be loaded.');
      return;
    }
    setEditingCadence(cadence);
    setSelectedSlot(null);
    setIsCadenceFormOpen(true);
  }, [cadences, notificationsService, selectedSlot, setSelectedSlot]);

  const refreshSlots = useCallback(async () => {
    if (!dateRange || !brandId) {
      return;
    }
    const service = await getPostingCadencesService();
    const [nextSlots, nextCadences] = await Promise.all([
      service.listSlots({
        brandId,
        endDate: dateRange.end.toISOString(),
        startDate: dateRange.start.toISOString(),
      }),
      service.list(brandId),
    ]);
    setSlots(nextSlots);
    setCadences(nextCadences);
  }, [brandId, dateRange, getPostingCadencesService, setSlots, setCadences]);

  function handleDeleteCadence() {
    if (!editingCadence) return;
    const cadenceId = editingCadence.id;
    setIsSlotPending(true);
    void (async () => {
      try {
        const service = await getPostingCadencesService();
        await service.delete(cadenceId);
        setIsCadenceFormOpen(false);
        setEditingCadence(null);
        notificationsService.success('Cadence deleted.');
        await refreshSlots();
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    })();
  }
  function handleSubmitCadence(
    input: Parameters<PostingCadencesService['create']>[0],
  ) {
    setIsSlotPending(true);
    void (async () => {
      try {
        const service = await getPostingCadencesService();
        if (editingCadence) {
          await service.update(editingCadence.id, input);
        } else {
          await service.create(input);
        }
        setIsCadenceFormOpen(false);
        setEditingCadence(null);
        notificationsService.success('Cadence saved.');
        await refreshSlots();
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    })();
  }
  return {
    editingCadence,
    setEditingCadence,
    isCadenceFormOpen,
    setIsCadenceFormOpen,
    isSlotPending,
    generateSlotByIdentity,
    handleDateClick,
    handleGenerateSlot,
    handleWriteSlot,
    handleSkipSlot,
    handleCancelSlot,
    handleCloseSlot,
    handleEditCadence,
    handleDeleteCadence,
    handleSubmitCadence,
  };
}
