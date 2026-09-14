"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8 rounded-xl bg-gray-100 dark:bg-gray-800" />;

  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const isDark = currentTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center justify-center h-8 w-8 rounded-xl bg-gray-100 dark:bg-[#1a1a1d] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-all shadow-xs cursor-pointer"
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 hover:rotate-45 transition-transform" strokeWidth={2} />
      ) : (
        <Moon className="h-4 w-4 text-slate-700 dark:text-slate-200 hover:-rotate-12 transition-transform" strokeWidth={2} />
      )}
    </button>
  );
}
