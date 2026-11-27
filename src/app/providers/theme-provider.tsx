import { createContext, type PropsWithChildren, useContext, useEffect, useState } from "react";

import { readPreference, writePreference } from "@/lib/preferences";

type Theme = "light" | "dark" | "system";
type Accent = "blue" | "purple" | "red" | "orange" | "yellow" | "green";
const ThemeContext = createContext<{
  theme: Theme;
  accent: Accent;
  setTheme: (value: Theme) => void;
  setAccent: (value: Accent) => void;
} | null>(null);
export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(() =>
    readPreference("theme", ["light", "dark", "system"], "system"),
  );
  const [accent, setAccent] = useState<Accent>(() =>
    readPreference("accent", ["blue", "purple", "red", "orange", "yellow", "green"], "blue"),
  );
  useEffect(() => {
    writePreference("theme", theme);
    const root = document.documentElement;
    const media = matchMedia("(prefers-color-scheme: dark)");
    // :root is the light source of truth; only effective dark gets the attribute.
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      if (dark) root.setAttribute("data-theme", "dark");
      else root.removeAttribute("data-theme");
    };
    apply();
    // An explicit Light/Dark choice must never follow the OS.
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    writePreference("accent", accent);
    const root = document.documentElement;
    for (const name of ["blue", "purple", "red", "orange", "yellow", "green"])
      root.classList.remove(`theme-${name}`);
    root.classList.add(`theme-${accent}`);
  }, [accent]);
  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider missing");
  return value;
}
