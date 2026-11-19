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
  const { isEnglish, setLanguage, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t('Pinulongan sa sistema', 'Interface language')}
      className={`inline-flex items-center p-0.5 rounded-xl shrink-0 ${
        onDark ? 'recessed-control-dark' : 'recessed-control'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setLanguage('mixed')}
        aria-pressed={!isEnglish}
        className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-[10px] text-xs font-extrabold transition-all cursor-pointer ${
          !isEnglish
            ? onDark
              ? 'recessed-pill-dark-active'
              : 'recessed-pill-active'
            : onDark
            ? 'text-[#D6EFD9] hover:text-white'
            : 'text-[#455C50] hover:text-[#1B4332]'
        }`}
      >
        CEB
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={isEnglish}
        className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-[10px] text-xs font-extrabold transition-all cursor-pointer ${
          isEnglish
            ? onDark
              ? 'recessed-pill-dark-active'
              : 'recessed-pill-active'
            : onDark
            ? 'text-[#D6EFD9] hover:text-white'
            : 'text-[#455C50] hover:text-[#1B4332]'
        }`}
      >
        EN
      </button>
    </div>
  );
}
