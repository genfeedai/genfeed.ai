'use client';

import { ComponentSize } from '@genfeedai/enums';
import type { ModalCreateThreadPreviewProps } from '@genfeedai/props/modals/modal.props';
import Badge from '@ui/display/badge/Badge';

export default function ModalCreateThreadPreview({
  fields,
  form,
  charLimit,
}: ModalCreateThreadPreviewProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Thread Preview</h3>
      <div className="space-y-3">
        {fields.map((field, index) => {
          const content = form.watch(`posts.${index}.description`);
          const charCount = content?.length || 0;
          const isOverLimit = charCount > charLimit;

          return (
            <div
              key={field.id}
              className="border border-white/[0.08] p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="primary" size={ComponentSize.SM}>
                    {index + 1}/{fields.length}
                  </Badge>
                  {index === 0 && (
                    <Badge variant="ghost" size={ComponentSize.SM}>
                      Root
                    </Badge>
                  )}
                  {index > 0 && (
                    <Badge variant="ghost" size={ComponentSize.SM}>
                      Reply
                    </Badge>
                  )}
                </div>
                <span
                  className={`text-xs ${isOverLimit ? 'text-error' : 'text-foreground/60'}`}
                >
                  {charCount}/{charLimit}
                </span>
              </div>
              <div className="text-sm">
                {content || (
                  <span className="text-foreground/40 italic">
                    No content yet…
                  </span>
                )}
              </div>
              {index < fields.length - 1 && (
                <div className="flex items-center gap-2 text-xs text-foreground/60">
                  <div className="h-4 w-px bg-muted" />
                  <span>Continues to post {index + 2}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
