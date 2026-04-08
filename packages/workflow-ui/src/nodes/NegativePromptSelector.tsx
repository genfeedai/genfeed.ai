'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { Button } from '../ui/button';

import { Checkbox } from '../ui/checkbox';

/**
 * Common negative prompt terms organized for quick selection
 * These are the most commonly used negative prompts for image/video generation
 */
const NEGATIVE_PROMPT_OPTIONS = [
  { label: 'Blurry', value: 'blurry' },
  { label: 'Distorted', value: 'distorted' },
  { label: 'Low Quality', value: 'low quality' },
  { label: 'Watermark', value: 'watermark' },
  { label: 'Text/Logos', value: 'text' },
  { label: 'Artifacts', value: 'artifacts' },
  { label: 'Grainy/Noisy', value: 'grainy' },
  { label: 'Oversaturated', value: 'oversaturated' },
] as const;

interface NegativePromptSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Parse a comma-separated negative prompt string into individual terms
 */
function parseNegativePrompt(value: string): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Check if a term matches any of the known options
 */
function isKnownTerm(term: string): boolean {
  const lowerTerm = term.toLowerCase();
  return NEGATIVE_PROMPT_OPTIONS.some(
    (opt) => opt.value.toLowerCase() === lowerTerm,
  );
}

/**
 * Extract custom terms (terms not in the predefined options)
 */
function extractCustomTerms(value: string): string {
  if (!value) return '';
  const terms = value
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
  const customTerms = terms.filter((term) => !isKnownTerm(term));
  return customTerms.join(', ');
}

/**
 * Combine checked options and custom terms into a single string
 */
function combineTerms(checkedValues: Set<string>, customText: string): string {
  const parts: string[] = [];

  // Add checked predefined options in their original order
  for (const opt of NEGATIVE_PROMPT_OPTIONS) {
    if (checkedValues.has(opt.value.toLowerCase())) {
      parts.push(opt.value);
    }
  }

  // Add custom terms
  if (customText.trim()) {
    const customTerms = customText
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean);
    parts.push(...customTerms);
  }

  return parts.join(', ');
}

function NegativePromptSelectorComponent({
  value,
  onChange,
}: NegativePromptSelectorProps) {
  // Collapsed by default
  const [isExpanded, setIsExpanded] = useState(false);

  // Parse the current value to determine which checkboxes should be checked
  const checkedTerms = useMemo(() => parseNegativePrompt(value), [value]);

  // Extract and track custom terms separately
  const [customText, setCustomText] = useState(() => extractCustomTerms(value));

  // Count selected items for collapsed summary
  const selectedCount = checkedTerms.size + (customText.trim() ? 1 : 0);

  // Handle checkbox toggle
  const handleCheckboxChange = useCallback(
    (optionValue: string, checked: boolean) => {
      const newChecked = new Set(checkedTerms);
      const lowerValue = optionValue.toLowerCase();

      if (checked) {
        newChecked.add(lowerValue);
      } else {
        newChecked.delete(lowerValue);
      }

      onChange(combineTerms(newChecked, customText));
    },
    [checkedTerms, customText, onChange],
  );

  // Handle custom text input
  const handleCustomChange = useCallback(
    (newCustomText: string) => {
      setCustomText(newCustomText);
      onChange(combineTerms(checkedTerms, newCustomText));
    },
    [checkedTerms, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Collapsible header */}
      <Button
        variant="ghost"
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left h-auto p-0 group"
      >
        <span className="text-xs text-muted-foreground">Negative Prompt</span>
        <div className="flex items-center gap-1.5">
          {selectedCount > 0 && (
            <span className="text-[10px] text-muted-foreground/70">
              {selectedCount} selected
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </Button>

      {/* Expandable content */}
      {isExpanded && (
        <>
          {/* Checkbox grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {NEGATIVE_PROMPT_OPTIONS.map((option) => {
              const isChecked = checkedTerms.has(option.value.toLowerCase());
              const checkboxId = `negative-prompt-${option.value}`;
              return (
                <div
                  key={option.value}
                  className="flex items-center gap-1.5 nodrag"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      if (typeof checked === 'boolean') {
                        handleCheckboxChange(option.value, checked);
                      }
                    }}
                    className="w-3.5 h-3.5"
                  />
                  <label
                    htmlFor={checkboxId}
                    className="text-sm text-foreground truncate cursor-pointer"
                  >
                    {option.label}
                  </label>
                </div>
              );
            })}
          </div>

          {/* Custom terms input */}
          <div className="flex flex-col gap-1 mt-1">
            <label className="text-xs text-muted-foreground">Custom</label>
            <input
              type="text"
              value={customText}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="ugly, deformed, ..."
              className="nodrag nopan w-full h-7 border border-input bg-background px-2 text-xs shadow-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </>
      )}
    </div>
  );
}

export const NegativePromptSelector = memo(NegativePromptSelectorComponent);
