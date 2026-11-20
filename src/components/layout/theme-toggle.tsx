"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

const STORAGE_KEY = "itech-theme";

/** Flips the `.dark` class on <html> and remembers the choice. */
function toggleTheme() {
  const root = document.documentElement;
  const next = !root.classList.contains("dark");
  root.classList.toggle("dark", next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  } catch {
    /* storage unavailable — fall back to a session-only toggle */
  }
}

/**
 * Toggle row for the account dropdown menus. The icon/label are swapped with
 * CSS (`dark:` variants) rather than state, so there is no hydration mismatch.
 */
export function ThemeToggleMenuItem() {
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        toggleTheme();
      }}
    >
      <Moon className="h-4 w-4 dark:hidden" />
      <Sun className="hidden h-4 w-4 dark:block" />
      <span className="dark:hidden">Dark mode</span>
      <span className="hidden dark:inline">Light mode</span>
    </DropdownMenuItem>
  );
}

/** Compact icon button for the desktop rail. */
export function ThemeToggleButton() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle dark mode"
      onClick={toggleTheme}
    >
      <Moon className="h-4 w-4 dark:hidden" />
      <Sun className="hidden h-4 w-4 dark:block" />
    </Button>
  );
}
