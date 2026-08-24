import { createStudioCharacterMentionExtension } from '@genfeedai/agent/extensions/studio-character-mention';
import { useCharacterMentions } from '@genfeedai/agent/hooks/use-character-mentions';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type {
  StudioCharacterMentionSubmitInput,
  UseStudioCharacterMentionsReturn,
} from '@genfeedai/agent/types/mention.types';
import { applyCharacterMentionsToSubmit } from '@genfeedai/helpers/content/character-mention.util';
import { useCallback, useMemo, useRef } from 'react';

export function useStudioCharacterMentions(
  apiService: AgentApiService | null,
): UseStudioCharacterMentionsReturn {
  const { isLoading, mentions } = useCharacterMentions(apiService);
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;

  const extraExtensions = useMemo(
    () => [createStudioCharacterMentionExtension(() => mentionsRef.current)],
    [],
  );

  const resolveSubmit = useCallback(
    (input: StudioCharacterMentionSubmitInput) =>
      applyCharacterMentionsToSubmit({
        catalog: mentionsRef.current,
        document: input.document,
        existingReferenceIds: input.existingReferenceIds,
        text: input.text,
      }),
    [],
  );

  return { extraExtensions, isLoading, mentions, resolveSubmit };
}
