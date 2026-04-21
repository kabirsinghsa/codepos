import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  card_foreground: string;
  primary: string;
  primary_foreground: string;
  secondary: string;
  secondary_foreground: string;
  muted: string;
  muted_foreground: string;
  accent: string;
  accent_foreground: string;
  border: string;
  input: string;
  ring: string;
  destructive: string;
  radius: string; // e.g. "0.625rem"
  bg_image_url: string; // empty string = none
  bg_overlay_opacity: string; // 0..1
};

export const DEFAULT_THEME: ThemeTokens = {
  background: '30 6% 6%',
  foreground: '40 15% 92%',
  card: '30 6% 9%',
  card_foreground: '40 15% 92%',
  primary: '42 55% 58%',
  primary_foreground: '30 10% 8%',
  secondary: '30 5% 12%',
  secondary_foreground: '40 12% 88%',
  muted: '30 5% 13%',
  muted_foreground: '35 8% 60%',
  accent: '42 55% 58%',
  accent_foreground: '30 10% 8%',
  border: '30 5% 16%',
  input: '30 5% 16%',
  ring: '42 55% 58%',
  destructive: '0 65% 48%',
  radius: '0.625rem',
  bg_image_url: '',
  bg_overlay_opacity: '0.78',
};

const TOKEN_TO_VAR: Record<keyof ThemeTokens, string | null> = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  card_foreground: '--card-foreground',
  primary: '--primary',
  primary_foreground: '--primary-foreground',
  secondary: '--secondary',
  secondary_foreground: '--secondary-foreground',
  muted: '--muted',
  muted_foreground: '--muted-foreground',
  accent: '--accent',
  accent_foreground: '--accent-foreground',
  border: '--border',
  input: '--input',
  ring: '--ring',
  destructive: '--destructive',
  radius: '--radius',
  bg_image_url: null,
  bg_overlay_opacity: null,
};

export function applyTheme(theme: ThemeTokens) {
  const root = document.documentElement;
  (Object.keys(TOKEN_TO_VAR) as (keyof ThemeTokens)[]).forEach((key) => {
    const cssVar = TOKEN_TO_VAR[key];
    if (cssVar) root.style.setProperty(cssVar, theme[key]);
  });
  // also derive popover/sidebar from card/background to keep consistency
  root.style.setProperty('--popover', theme.card);
  root.style.setProperty('--popover-foreground', theme.card_foreground);

  // background image
  const body = document.body;
  if (theme.bg_image_url) {
    const overlay = `linear-gradient(hsl(${theme.background} / ${theme.bg_overlay_opacity}), hsl(${theme.background} / ${theme.bg_overlay_opacity}))`;
    body.style.backgroundImage = `${overlay}, url("${theme.bg_image_url}")`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundAttachment = 'fixed';
    body.style.backgroundRepeat = 'no-repeat';
  } else {
    body.style.backgroundImage = '';
  }
}

type Ctx = {
  theme: ThemeTokens;
  setTheme: (t: ThemeTokens) => void;
  saveTheme: (t: ThemeTokens) => Promise<void>;
  resetTheme: () => Promise<void>;
  loading: boolean;
};

const ThemeContext = createContext<Ctx | undefined>(undefined);

const SETTING_KEY = 'theme_tokens';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeTokens>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('business_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (!mounted) return;
      if (data?.value) {
        try {
          const parsed = { ...DEFAULT_THEME, ...JSON.parse(data.value) } as ThemeTokens;
          setThemeState(parsed);
          applyTheme(parsed);
        } catch {
          applyTheme(DEFAULT_THEME);
        }
      } else {
        applyTheme(DEFAULT_THEME);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const setTheme = (t: ThemeTokens) => {
    setThemeState(t);
    applyTheme(t);
  };

  const saveTheme = async (t: ThemeTokens) => {
    setTheme(t);
    await supabase
      .from('business_settings')
      .upsert({ key: SETTING_KEY, value: JSON.stringify(t) }, { onConflict: 'key' });
  };

  const resetTheme = async () => {
    await saveTheme(DEFAULT_THEME);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, saveTheme, resetTheme, loading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// Helpers for hex <-> hsl string ("H S% L%")
export function hexToHslString(hex: string): string {
  const m = hex.replace('#', '');
  const bigint = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function hslStringToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return '#000000';
  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
