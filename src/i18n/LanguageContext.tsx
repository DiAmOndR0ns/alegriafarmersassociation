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

/** Consistent language switch button used in headers across the app. */
export function LanguageToggle({
  className = '',
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  const { isEnglish, toggleLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={isEnglish ? 'Balik sa English + Bisaya (default)' : 'Translate everything to English'}
      aria-label={isEnglish ? 'Switch back to English and Bisaya' : 'Switch to English only'}
      className={
        className ||
        [
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold normal-case tracking-normal border transition-colors cursor-pointer whitespace-nowrap shadow-sm',
          onDark
            ? 'bg-[#081C15] border-[#52B788] text-[#D8F3DC] hover:bg-[#143326]'
            : 'bg-[#EAF6EE] border-[#B7E3C4] text-[#1B4332] hover:bg-[#D4EEDC]',
        ].join(' ')
      }
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m5 8 6 6" />
        <path d="m4 14 6-6 2-3" />
        <path d="M2 5h12" />
        <path d="M7 2h1" />
        <path d="m22 22-5-10-5 10" />
        <path d="M14 18h6" />
      </svg>
      <span>{isEnglish ? 'English + Bisaya' : 'Translate'}</span>
    </button>
  );
}
