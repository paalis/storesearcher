"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "butikkbrowser:theme";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "Systemtema", light: "Lyst tema", dark: "Mørkt tema" };

function apply(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY) as Theme | null;
    return t && ORDER.includes(t) ? t : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leser lagret valg etter hydrering
    setTheme(readTheme());
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => theme === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={cycle}
      className="btn-ghost size-9 p-0"
      aria-label={`${LABEL[theme]} – klikk for å bytte`}
      title={LABEL[theme]}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
