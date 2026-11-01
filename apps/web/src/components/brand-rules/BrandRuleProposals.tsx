import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { HarnessProfilesService } from '@genfeedai/services/ai/harness-profiles.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the user stops typing before their edit is looked at. */
const PROPOSE_DEBOUNCE_MS = 1000;

export interface BrandRuleProposalsProps {
  /** The text the model wrote; null when the post was not generated here. */
  original?: string | null;
  /** The text as it stands now, including the user's edits. */
  edited?: string;
  /** Why the user is turning a draft down, in their words. */
  reason?: string;
  /** Tells the parent while a rule is being saved, so it can hold other writes. */
  onSavingChange?: (isSaving: boolean) => void;
}

/**
 * Turns a correction into short brand rules ("Never use X", "Prefer Y over X"):
 * the user's edit to a generated draft, or the reason they give for turning one
 * down. A rule is saved only when the user accepts it; dismissing it saves
 * nothing.
 */
export default function BrandRuleProposals({
  original = null,
  edited = '',
  reason = '',
  onSavingChange,
}: BrandRuleProposalsProps) {
  const { brandId } = useBrand();
  const translate = useTranslations('ui.brandRuleProposals');
  const [proposals, setProposals] = useState<string[]>([]);
  const [resolved, setResolved] = useState<string[]>([]);
  const [savedRule, setSavedRule] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const getService = useAuthedService(
    useCallback(
      (token: string) => HarnessProfilesService.getInstance(token),
      [],
    ),
  );

  // The effect below runs on the user's edits, not whenever the service hook
  // hands back a new function.
  const getServiceRef = useRef(getService);
  getServiceRef.current = getService;

  const onSavingChangeRef = useRef(onSavingChange);
  onSavingChangeRef.current = onSavingChange;
  useEffect(() => {
    onSavingChangeRef.current?.(isSaving);
  }, [isSaving]);

  useEffect(() => {
    const hasEdit = Boolean(original) && edited.trim() !== original?.trim();
    const hasReason = reason.trim().length > 0;
    // A suggestion belongs to the text it was made from; drop it as soon as that
    // text changes, so a slow or failed lookup never leaves a stale rule to save.
    setProposals([]);
    if (!brandId || (!hasEdit && !hasReason)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const service = await getServiceRef.current();
        const next = await service.proposeRules(
          {
            brandId,
            ...(hasEdit ? { edited, original: original ?? undefined } : {}),
            ...(hasReason ? { reason } : {}),
          },
          controller.signal,
        );
        if (!controller.signal.aborted) setProposals(next);
      } catch (error) {
        // Suggestions are optional; a failed lookup just shows none.
        if (!controller.signal.aborted)
          logger.error('Brand rule proposal failed', error);
      }
    }, PROPOSE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [brandId, edited, original, reason]);

  const pending = proposals.filter((rule) => !resolved.includes(rule));

  const save = async (rule: string) => {
    setIsSaving(true);
    try {
      const service = await getService();
      await service.saveRules({ brandId, rules: [rule] });
      setResolved((current) => [...current, rule]);
      setSavedRule(rule);
    } catch (error) {
      logger.error('Saving the brand rule failed', error);
      NotificationsService.getInstance().error(translate('failed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {pending.length > 0 ? (
        <section
          aria-label={translate('title')}
          className="space-y-2 rounded-md border border-border p-3"
        >
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {translate('title')}
            </h3>
            <p className="text-xs text-muted-foreground">{translate('hint')}</p>
          </div>
          <ul className="space-y-2">
            {pending.map((rule) => (
              <li
                key={rule}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm text-foreground">{rule}</span>
                <span className="flex items-center gap-1.5">
                  <Button
                    size={ButtonSize.SM}
                    variant={ButtonVariant.DEFAULT}
                    label={translate('save')}
                    isDisabled={isSaving}
                    onClick={() => void save(rule)}
                  />
                  <Button
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                    label={translate('dismiss')}
                    isDisabled={isSaving}
                    onClick={() => setResolved((current) => [...current, rule])}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {savedRule ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('saved', { rule: savedRule })}
        </p>
      ) : null}
    </>
  );
}
