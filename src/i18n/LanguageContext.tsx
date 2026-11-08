import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Global language mode for the whole application.
 *
 *  - 'mixed' (DEFAULT): English + Bisaya UI text, as the association writes it
 *  - 'en'             : English only
 *
 * Rules:
 *  - `t(bisaya, english)` swaps UI chrome (labels, buttons, headings, helper text).
 *  - Content typed by officers — member names, announcement titles, activity
 *    descriptions, product names, notes, remarks — is rendered as-is and is
 *    NEVER passed through `t()`. It is data, not interface.
 */
export type LanguageMode = 'mixed' | 'en';

interface LanguageContextValue {
  language: LanguageMode;
  setLanguage: (mode: LanguageMode) => void;
  toggleLanguage: () => void;
  resetToDefault: () => void;
  isEnglish: boolean;
  /** Pick between a Bisaya variant (mixed mode) and an English-only variant. */
  t: (bisaya: string, english: string) => string;
}

export const DEFAULT_LANGUAGE: LanguageMode = 'mixed';
const STORAGE_KEY = 'bafa_language_mode';

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readStoredLanguage(): LanguageMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'mixed') return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageMode>(() => readStoredLanguage());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language === 'en' ? 'en' : 'ceb';
    }
  }, [language]);

  const setLanguage = (mode: LanguageMode) => setLanguageState(mode);

  const value = useMemo<LanguageContextValue>(() => {
    const isEnglish = language === 'en';
    return {
      language,
      setLanguage: (mode: LanguageMode) => setLanguageState(mode),
      toggleLanguage: () => setLanguageState((prev) => (prev === 'en' ? 'mixed' : 'en')),
      resetToDefault: () => setLanguageState(DEFAULT_LANGUAGE),
      isEnglish,
      t: (bisaya: string, english: string) => (isEnglish ? english : bisaya),
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Access the global language. Safe to call outside the provider: it falls back
 * to the default (mixed) mode rather than crashing standalone renders.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  return {
    language: DEFAULT_LANGUAGE,
    setLanguage: () => undefined,
    toggleLanguage: () => undefined,
    resetToDefault: () => undefined,
    isEnglish: false,
    t: (bisaya: string) => bisaya,
  };
}

export function LanguageToggle({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  const { isEnglish, toggleLanguage } = useLanguage();
  const nextLanguage = isEnglish ? 'Bisaya' : 'English';

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={isEnglish ? 'Switch language to Bisaya' : 'Ilisi ang pinulongan sa English'}
      className={`min-h-11 px-4 py-2 rounded-xl border-2 font-bold text-sm transition-colors focus-visible:outline ${
        onDark
          ? 'border-emerald-300 text-white hover:bg-white/10'
          : 'border-[#1B4332] text-[#1B4332] hover:bg-emerald-50'
      } ${className}`}
    >
      {nextLanguage}
    </button>
  );
}
