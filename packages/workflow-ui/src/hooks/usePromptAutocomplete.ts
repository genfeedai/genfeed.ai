import type { AvailableVariable } from '@genfeedai/types';
import type { RefObject } from 'react';
import { useCallback, useMemo, useState } from 'react';

interface UsePromptAutocompleteOptions {
  availableVariables: AvailableVariable[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  localTemplate: string;
  setLocalTemplate: (value: string) => void;
  onTemplateCommit?: (newTemplate: string) => void;
}

interface UsePromptAutocompleteReturn {
  showAutocomplete: boolean;
  autocompletePosition: { top: number; left: number };
  filteredAutocompleteVars: AvailableVariable[];
  selectedAutocompleteIndex: number;
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleAutocompleteSelect: (varName: string) => void;
  closeAutocomplete: () => void;
}

export function usePromptAutocomplete({
  availableVariables,
  textareaRef,
  localTemplate,
  setLocalTemplate,
  onTemplateCommit,
}: UsePromptAutocompleteOptions): UsePromptAutocompleteReturn {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompletePosition, setAutocompletePosition] = useState({
    left: 0,
    top: 0,
  });
  const [autocompleteFilter, setAutocompleteFilter] = useState('');
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0);

  const filteredAutocompleteVars = useMemo(() => {
    return availableVariables.filter((v) =>
      v.name.toLowerCase().includes(autocompleteFilter.toLowerCase()),
    );
  }, [availableVariables, autocompleteFilter]);

  const handleAutocompleteSelect = useCallback(
    (varName: string) => {
      if (!textareaRef.current) return;

      const cursorPos = textareaRef.current.selectionStart;
      const textBeforeCursor = localTemplate.slice(0, cursorPos);
      const textAfterCursor = localTemplate.slice(cursorPos);

      const match = textBeforeCursor.match(/@(\w*)$/);
      if (!match) return;

      const atPosition = cursorPos - match[0].length;
      const newTemplate = `${localTemplate.slice(0, atPosition)}@${varName}${textAfterCursor}`;

      setLocalTemplate(newTemplate);
      onTemplateCommit?.(newTemplate);
      setShowAutocomplete(false);

      const newCursorPos = atPosition + varName.length + 1;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [localTemplate, textareaRef, setLocalTemplate, onTemplateCommit],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setLocalTemplate(newValue);

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const match = textBeforeCursor.match(/@(\w*)$/);

      if (match && textareaRef.current) {
        setAutocompleteFilter(match[1] || '');
        setSelectedAutocompleteIndex(0);

        const lineHeight = 20;
        const lines = textBeforeCursor.split('\n');
        const currentLine = lines.length - 1;
        const top = currentLine * lineHeight + 30;
        const left = 10;

        setAutocompletePosition({ left, top });
        setShowAutocomplete(true);
      } else {
        setShowAutocomplete(false);
      }
    },
    [textareaRef, setLocalTemplate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showAutocomplete) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedAutocompleteIndex(
          (prev) => (prev + 1) % filteredAutocompleteVars.length,
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedAutocompleteIndex(
          (prev) =>
            (prev - 1 + filteredAutocompleteVars.length) %
            filteredAutocompleteVars.length,
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredAutocompleteVars.length > 0) {
          e.preventDefault();
          handleAutocompleteSelect(
            filteredAutocompleteVars[selectedAutocompleteIndex].name,
          );
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowAutocomplete(false);
      }
    },
    [
      showAutocomplete,
      filteredAutocompleteVars,
      selectedAutocompleteIndex,
      handleAutocompleteSelect,
    ],
  );

  const closeAutocomplete = useCallback(() => {
    setShowAutocomplete(false);
  }, []);

  return {
    autocompletePosition,
    closeAutocomplete,
    filteredAutocompleteVars,
    handleAutocompleteSelect,
    handleChange,
    handleKeyDown,
    selectedAutocompleteIndex,
    showAutocomplete,
  };
}
