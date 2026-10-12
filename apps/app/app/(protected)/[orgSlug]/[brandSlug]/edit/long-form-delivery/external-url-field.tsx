import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ExternalUrlFieldProps } from '@props/edit/long-form-delivery.props';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Records the live link of an item published outside Genfeed. */
export default function ExternalUrlField({
  id,
  isSaving,
  onSave,
  value,
}: ExternalUrlFieldProps) {
  const translate = useTranslations('common.longFormDelivery');
  const [draft, setDraft] = useState(value ?? '');
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const trimmed = draft.trim();
  const isUnchanged = trimmed === (value ?? '');

  function handleSave() {
    if (!isWebUrl(trimmed)) {
      setIsInvalid(true);
      return;
    }
    setIsInvalid(false);
    void onSave(trimmed);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {translate('externalUrlLabel')}
      </Label>
      <p className="text-xs text-foreground/60">
        {translate('externalUrlHint')}
      </p>
      <Input
        id={id}
        type="url"
        inputMode="url"
        placeholder={translate('externalUrlPlaceholder')}
        value={draft}
        aria-invalid={isInvalid}
        onChange={(event) => {
          setDraft(event.target.value);
          setIsInvalid(false);
        }}
      />
      {isInvalid ? (
        <p role="alert" className="text-xs text-destructive">
          {translate('externalUrlInvalid')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          label={translate('externalUrlSave')}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          isLoading={isSaving}
          isDisabled={isSaving || !trimmed || isUnchanged}
          onClick={handleSave}
        />
        {value ? (
          <Button
            label={translate('externalUrlClear')}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            isDisabled={isSaving}
            onClick={() => void onSave(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
