'use client';

import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ModalNewsletterProps } from '@props/modals/modal.props';
import { NewslettersService } from '@services/content/newsletters.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function ModalNewsletter({ onCreated }: ModalNewsletterProps) {
  const translate = useTranslations('common.newsletterCreation');
  const getService = useAuthedService((token: string) =>
    NewslettersService.getInstance(token),
  );
  const [topic, setTopic] = useState('');
  const [angle, setAngle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function generateDraft() {
    if (!topic.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const service = await getService();
      const newsletter = await service.generateDraft({
        topic: topic.trim(),
        angle: angle.trim() || undefined,
        instructions: instructions.trim() || undefined,
      });
      closeModal(ModalEnum.NEWSLETTER);
      setTopic('');
      setAngle('');
      setInstructions('');
      onCreated(newsletter.id);
    } catch (error) {
      logger.error('Failed to generate newsletter', error);
      NotificationsService.getInstance().error(translate('error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal id={ModalEnum.NEWSLETTER} title={translate('title')}>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void generateDraft();
        }}
      >
        <FormControl label={translate('topic')}>
          <Input
            aria-label={translate('topic')}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            isRequired
            isDisabled={isSubmitting}
          />
        </FormControl>
        <FormControl label={translate('angle')}>
          <Input
            aria-label={translate('angle')}
            value={angle}
            onChange={(event) => setAngle(event.target.value)}
            isDisabled={isSubmitting}
          />
        </FormControl>
        <FormControl label={translate('instructions')}>
          <Textarea
            aria-label={translate('instructions')}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            isDisabled={isSubmitting}
          />
        </FormControl>
        <ModalActions>
          <Button
            variant={ButtonVariant.SECONDARY}
            isDisabled={isSubmitting}
            onClick={() => closeModal(ModalEnum.NEWSLETTER)}
          >
            {translate('cancel')}
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            isDisabled={!topic.trim() || isSubmitting}
          >
            {translate('generate')}
          </Button>
        </ModalActions>
      </Form>
    </Modal>
  );
}
