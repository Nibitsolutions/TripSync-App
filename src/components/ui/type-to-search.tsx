"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface SearchOption {
  value: string;
  label: string;
  code?: string;
  sublabel?: string;
  [key: string]: any;
}

interface TypeToSearchProps {
  value?: string;
  onChange?: (value: string) => void;
  onSelectOption?: (option: SearchOption) => void;
  options: SearchOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maxSuggestions?: number;
  id?: string;
  name?: string;
}

export function TypeToSearch({
  value = "",
  onChange,
  onSelectOption,
  options = [],
  placeholder = "Type to search...",
  className = "",
  disabled = false,
  maxSuggestions = 8,
  id,
  name,
}: TypeToSearchProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uniqueId = useId();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter suggestions strictly when user types (> 0 chars)
  const query = inputValue.trim().toLowerCase();
  const suggestions: SearchOption[] = query.length > 0
    ? options
        .filter((opt) => {
          const l = (opt.label || "").toLowerCase();
          const v = (opt.value || "").toLowerCase();
          const c = (opt.code || "").toLowerCase();
          const s = (opt.sublabel || "").toLowerCase();
          return l.includes(query) || v.includes(query) || c.includes(query) || s.includes(query);
        })
        .slice(0, maxSuggestions)
    : [];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setHighlightedIndex(-1);

    if (val.trim().length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }

    if (onChange) {
      onChange(val);
    }
  };

  const handleSelect = (option: SearchOption) => {
    setInputValue(option.label || option.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (onChange) {
      onChange(option.value);
    }
    if (onSelectOption) {
      onSelectOption(option);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown" && inputValue.trim().length > 0) {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      <input
        id={id || uniqueId}
        name={name}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          // Rule: Nothing opens on click if query is empty
          if (inputValue.trim().length > 0 && suggestions.length > 0) {
            setIsOpen(true);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={cn(
          "h-8 w-full rounded-md border border-input bg-white dark:bg-[#161619] px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 shadow-xs transition-colors placeholder:text-slate-400 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />

      {/* Floating Suggestions Panel (Google Search style) */}
      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161619] py-1 shadow-lg text-xs select-none"
        >
          {suggestions.map((opt, idx) => {
            const isHighlighted = idx === highlightedIndex;
            return (
              <li
                key={opt.value + "-" + idx}
                onClick={() => handleSelect(opt)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={cn(
                  "px-3 py-1.5 cursor-pointer flex items-center justify-between transition-colors",
                  isHighlighted
                    ? "bg-primary/10 text-primary dark:bg-primary/20 font-semibold"
                    : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <div className="flex items-center gap-2 truncate">
                  {opt.code && (
                    <span className="font-mono text-[10px] font-bold px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {opt.code}
                    </span>
                  )}
                  <span className="truncate">{opt.label}</span>
                </div>
                {opt.sublabel && (
                  <span className="text-[10px] text-slate-400 font-normal ml-2 flex-shrink-0">
                    {opt.sublabel}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
