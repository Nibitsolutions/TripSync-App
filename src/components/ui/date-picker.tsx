"use client";

import React, { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatDateDDMMYYYY, parseDDMMYYYYToYYYYMMDD, formatYYYYMMDD } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function DatePicker({
  value = "",
  onChange,
  placeholder = "DD-MM-YYYY",
  className = "",
  disabled = false,
  readOnly = false,
  id,
  name,
  required,
}: DatePickerProps) {
  const [displayValue, setDisplayValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse prop value to Date for calendar navigation
  const getInitialViewDate = (val?: string) => {
    if (!val) return new Date();
    const iso = parseDDMMYYYYToYYYYMMDD(val);
    const parts = iso.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return new Date(y, m, d);
      }
    }
    return new Date();
  };

  const [viewDate, setViewDate] = useState<Date>(() => getInitialViewDate(value));

  // Sync prop value to display value
  useEffect(() => {
    setDisplayValue(formatDateDDMMYYYY(value));
    if (value) {
      setViewDate(getInitialViewDate(value));
    }
  }, [value]);

  // Click outside to close popup
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Format typing input as DD-MM-YYYY automatically
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value;

    // Allow user to type numbers and dashes
    const digitsOnly = inputVal.replace(/\D/g, "").slice(0, 8);
    let formatted = "";

    if (digitsOnly.length > 0) {
      const dd = digitsOnly.slice(0, 2);
      formatted = dd;
      if (digitsOnly.length >= 3) {
        const mm = digitsOnly.slice(2, 4);
        formatted += `-${mm}`;
        if (digitsOnly.length >= 5) {
          const yyyy = digitsOnly.slice(4, 8);
          formatted += `-${yyyy}`;
        }
      }
    } else if (inputVal.includes("-")) {
      formatted = inputVal;
    }

    setDisplayValue(formatted);

    // If fully typed in DD-MM-YYYY format
    if (/^\d{2}-\d{2}-\d{4}$/.test(formatted)) {
      const [ddStr, mmStr, yyyyStr] = formatted.split("-");
      const dd = parseInt(ddStr, 10);
      const mm = parseInt(mmStr, 10);
      const yyyy = parseInt(yyyyStr, 10);

      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1900 && yyyy <= 2100) {
        const iso = `${yyyyStr}-${mmStr.padStart(2, "0")}-${ddStr.padStart(2, "0")}`;
        setViewDate(new Date(yyyy, mm - 1, dd));
        if (onChange) onChange(iso);
        return;
      }
    }

    // If user clears field
    if (formatted === "" && onChange) {
      onChange("");
    }
  };

  const handleBlur = () => {
    if (!displayValue) {
      if (onChange) onChange("");
      return;
    }
    // Re-verify and format on blur
    const iso = parseDDMMYYYYToYYYYMMDD(displayValue);
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      setDisplayValue(formatDateDDMMYYYY(iso));
      if (onChange) onChange(iso);
    } else if (value) {
      setDisplayValue(formatDateDDMMYYYY(value));
    }
  };

  // Calendar Day Click Handler
  const handleSelectDay = (day: number) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const selected = new Date(year, month, day);
    const iso = formatYYYYMMDD(selected);

    setDisplayValue(formatDateDDMMYYYY(iso));
    setIsOpen(false);
    if (onChange) onChange(iso);
  };

  // Month navigation
  const prevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectMonth = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = parseInt(e.target.value, 10);
    setViewDate(new Date(viewDate.getFullYear(), m, 1));
  };

  const handleSelectYear = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = parseInt(e.target.value, 10);
    setViewDate(new Date(y, viewDate.getMonth(), 1));
  };

  // Select Today
  const handleToday = () => {
    const today = new Date();
    const iso = formatYYYYMMDD(today);
    setDisplayValue(formatDateDDMMYYYY(iso));
    setViewDate(today);
    setIsOpen(false);
    if (onChange) onChange(iso);
  };

  // Clear Date
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDisplayValue("");
    if (onChange) onChange("");
  };

  // Build Calendar Days
  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Selected date ISO comparison
  const selectedIso = parseDDMMYYYYToYYYYMMDD(value);

  // Generate Year range for select
  const years = [];
  const startYear = Math.max(1950, currentYear - 50);
  const endYear = currentYear + 20;
  for (let y = startYear; y <= endYear; y++) {
    years.push(y);
  }

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      <div className="relative flex items-center">
        <input
          id={id}
          name={name}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onClick={() => !disabled && !readOnly && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          className={cn(
            "h-8 w-full rounded-md border border-input bg-white dark:bg-[#161619] px-2.5 py-1 pr-7 text-xs font-mono text-slate-800 dark:text-slate-200 shadow-xs transition-colors placeholder:text-slate-400 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        />
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {displayValue && !disabled && !readOnly && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Clear date"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled || readOnly}
            onClick={() => !disabled && !readOnly && setIsOpen(!isOpen)}
            className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
            tabIndex={-1}
          >
            <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          </button>
        </div>
      </div>

      {/* Calendar Popup Dropdown */}
      {isOpen && !disabled && !readOnly && (
        <div className="absolute left-0 z-50 mt-1 w-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161619] p-2.5 shadow-xl text-xs select-none">
          {/* Calendar Header */}
          <div className="flex items-center justify-between gap-1 mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1">
              <select
                value={currentMonth}
                onChange={handleSelectMonth}
                className="h-6 text-[11px] font-medium bg-transparent border-none rounded-md px-1 text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx} className="bg-white dark:bg-[#161619]">
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={currentYear}
                onChange={handleSelectYear}
                className="h-6 text-[11px] font-medium bg-transparent border-none rounded-md px-1 text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
              >
                {years.map((y) => (
                  <option key={y} value={y} className="bg-white dark:bg-[#161619]">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-slate-400 mb-1">
            {WEEKDAY_NAMES.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Blank offset spaces */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}

            {/* Day buttons */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dayIso = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const isSelected = selectedIso === dayIso;
              const isToday =
                new Date().getDate() === dayNum &&
                new Date().getMonth() === currentMonth &&
                new Date().getFullYear() === currentYear;

              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => handleSelectDay(dayNum)}
                  className={cn(
                    "h-6 w-6 mx-auto flex items-center justify-center rounded-md text-[11px] font-medium transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground font-bold"
                      : isToday
                      ? "border border-primary text-primary font-bold"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  )}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px]">
            <button
              type="button"
              onClick={handleToday}
              className="text-primary font-semibold hover:underline"
            >
              Today
            </button>
            <span className="text-[10px] text-slate-400 font-mono">Format: DD-MM-YYYY</span>
          </div>
        </div>
      )}
    </div>
  );
}
