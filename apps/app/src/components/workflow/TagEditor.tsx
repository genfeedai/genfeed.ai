'use client';

import { Plus, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { workflowsApi } from '@/lib/api';

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagEditor({ tags, onChange }: TagEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    workflowsApi
      .getAllTags()
      .then(setAllTags)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (inputValue.trim()) {
      const filtered = allTags
        .filter(
          (t: string) => t.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(t)
        )
        .slice(0, 5);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  }, [inputValue, allTags, tags]);

  const addTag = useCallback(
    (tag: string) => {
      const normalized = tag
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');
      if (normalized && !tags.includes(normalized)) {
        onChange([...tags, normalized]);
      }
      setInputValue('');
      setIsAdding(false);
    },
    [tags, onChange]
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(tags.filter((t) => t !== tag));
    },
    [tags, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        e.preventDefault();
        addTag(inputValue);
      } else if (e.key === 'Escape') {
        setIsAdding(false);
        setInputValue('');
      }
    },
    [inputValue, addTag]
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] group"
        >
          <Tag className="w-3 h-3" />
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="opacity-0 group-hover:opacity-100 hover:text-[var(--foreground)] transition"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {isAdding ? (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Delay to allow suggestion click
              setTimeout(() => {
                setIsAdding(false);
                setInputValue('');
              }, 150);
            }}
            placeholder="Add tag..."
            className="w-24 px-2 py-0.5 text-xs bg-[var(--secondary)] border border-[var(--border)] rounded-full text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[120px] z-50">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-left text-[var(--foreground)] hover:bg-[var(--secondary)] transition"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded-full text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition"
        >
          <Plus className="w-3 h-3" />
          Tag
        </button>
      )}
    </div>
  );
}
