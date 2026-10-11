"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

export const THEME_KEY = "signal-watch:theme";

/** Runs before first paint (inlined in the root layout) so a saved light theme never flashes dark. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;

function current(): Theme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** The active theme, kept in sync with the root element's data-theme attribute. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => {
    setThemeState(current());
    const observer = new MutationObserver(() => setThemeState(current()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const setTheme = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  };
  return [theme, setTheme];
}
