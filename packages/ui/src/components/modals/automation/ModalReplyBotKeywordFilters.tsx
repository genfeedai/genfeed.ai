import type { ReplyBotConfigSchema } from '@genfeedai/client/schemas';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import type { UseFormReturn } from 'react-hook-form';

type Props = {
  form: UseFormReturn<ReplyBotConfigSchema>;
  isSubmitting: boolean;
};

export default function ModalReplyBotKeywordFilters({
  form,
  isSubmitting,
}: Props) {
  return (
    <>
      <div className="flex items-center gap-4 my-4">
        <div className="h-px bg-border flex-1" />
        <span className="text-sm text-muted-foreground">Keyword Triggers</span>
        <div className="h-px bg-border flex-1" />
      </div>

      <FormControl label="Include Keywords (comma-separated)">
        <Input
          type="text"
          name="filters.includeKeywords"
          control={form.control}
          onChange={(e) => {
            const keywords = e.target.value.split(',').flatMap((k: string) => {
              const t = k.trim();
              return t ? [t] : [];
            });
            form.setValue('filters.includeKeywords', keywords, {
              shouldValidate: true,
            });
          }}
          placeholder="INFO, YES, SEND"
          isDisabled={isSubmitting}
        />
      </FormControl>
      <p className="text-xs text-foreground/50 -mt-2">
        Only DM users who comment these words. Post &quot;Comment INFO to get
        our free course&quot; then the bot auto-DMs commenters.
      </p>

      <FormControl label="Exclude Keywords (comma-separated)">
        <Input
          type="text"
          name="filters.excludeKeywords"
          control={form.control}
          onChange={(e) => {
            const keywords = e.target.value.split(',').flatMap((k: string) => {
              const t = k.trim();
              return t ? [t] : [];
            });
            form.setValue('filters.excludeKeywords', keywords, {
              shouldValidate: true,
            });
          }}
          placeholder="spam, unsubscribe"
          isDisabled={isSubmitting}
        />
      </FormControl>
    </>
  );
}
