"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { ThemeName } from "@/types";

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "natural_komame",
  setTheme: () => {},
});

const THEME_MAP: Record<ThemeName, string> = {
  natural_komame: "",
  warm_latte: "warm-latte",
  fintech_indigo: "fintech-indigo",
  forest_mint: "forest-mint",
  slate_dark: "slate-dark",
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("natural_komame");

  useEffect(() => {
    const saved = localStorage.getItem("komame_theme") as ThemeName;
    if (saved && THEME_MAP[saved] !== undefined) {
      setThemeState(saved);
      applyTheme(saved);
    }
  }, []);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem("komame_theme", newTheme);
    applyTheme(newTheme);
  };

  const applyTheme = (t: ThemeName) => {
    const attr = THEME_MAP[t];
    if (attr) {
      document.documentElement.setAttribute("data-theme", attr);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
