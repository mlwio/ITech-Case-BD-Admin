"use client";

import * as React from "react";

/**
 * Anti-inspect guard.
 *
 * Production-only, best-effort deterrent that makes casual source peeking and
 * DevTools access awkward. It blocks the right-click context menu and the
 * common DevTools / view-source keyboard shortcuts.
 *
 * This is a UX-level obstacle, not a security boundary — all sensitive logic
 * stays on the server behind authenticated sessions.
 */
export function AntiInspectGuard() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    function onContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const cmdOrCtrl = event.metaKey || event.ctrlKey;
      const devToolsCombo =
        cmdOrCtrl && event.shiftKey && (key === "i" || key === "j" || key === "c");
      const macDevToolsCombo = event.metaKey && event.altKey && ["i", "j", "c", "u"].includes(key);

      if (
        key === "f12" ||
        devToolsCombo ||
        macDevToolsCombo ||
        (cmdOrCtrl && key === "u")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return null;
}
