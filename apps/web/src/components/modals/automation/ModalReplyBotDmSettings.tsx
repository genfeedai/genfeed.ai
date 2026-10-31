import type { ReplyBotConfigSchema } from '@genfeedai/client/schemas';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import type { KeyboardEvent } from 'react';
import type { UseFormReturn } from 'react-hook-form';

type Props = {
  form: UseFormReturn<ReplyBotConfigSchema>;
  isSubmitting: boolean;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
};

export default function ModalReplyBotDmSettings({
  form,
  isSubmitting,
  onKeyDown,
}: Props) {
  return (
    <>
      <div className="flex items-center gap-4 my-4">
        <div className="h-px bg-border flex-1" />
        <span className="text-sm text-muted-foreground">
          DM Message Settings
        </span>
        <div className="h-px bg-border flex-1" />
      </div>

      <FormControl label="Product Context">
        <Textarea
          name="dmConfig.context"
          control={form.control}
          onChange={(e) => {
            form.setValue('dmConfig.context', e.target.value, {
              shouldValidate: true,
            });
          }}
          placeholder="What product are you selling? Describe your offer…"
          isDisabled={isSubmitting}
          onKeyDown={onKeyDown}
          className="h-20"
        />
      </FormControl>

      <FormControl label="Custom DM Instructions">
        <Textarea
          name="dmConfig.customInstructions"
          control={form.control}
          onChange={(e) => {
            form.setValue('dmConfig.customInstructions', e.target.value, {
              shouldValidate: true,
            });
          }}
          placeholder="Any specific instructions for the DM?"
          isDisabled={isSubmitting}
          onKeyDown={onKeyDown}
          className="h-20"
        />
      </FormControl>

      <FormControl label="CTA Link">
        <Input
          type="text"
          name="dmConfig.ctaLink"
          control={form.control}
          onChange={(e) => {
            form.setValue('dmConfig.ctaLink', e.target.value, {
              shouldValidate: true,
            });
          }}
          placeholder="https://app.genfeed.ai"
          isDisabled={isSubmitting}
        />
      </FormControl>

      <FormControl label="Offer">
        <Input
          type="text"
          name="dmConfig.offer"
          control={form.control}
          onChange={(e) => {
            form.setValue('dmConfig.offer', e.target.value, {
              shouldValidate: true,
            });
          }}
          placeholder="30-Day Content Sprint"
          isDisabled={isSubmitting}
        />
      </FormControl>
    </>
  );
}
