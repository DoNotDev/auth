// packages/features/auth/src/emailAuth/__tests__/localeT.ts

/**
 * @fileoverview Test translator on the framework `en` locales
 * @description Components carry no fallback text: tests read the texts the user
 * sees from `auth_en.json` / `dndev_en.json` through a real i18next instance
 * (nested and dotted keys, plurals, `{{name}}` interpolation). A missing key gives
 * the key.
 */

import { createInstance, type TOptions } from 'i18next';

import dndev from '../../../../../core/i18n/locales/eager/dndev_en.json';
import auth from '../../../../../core/i18n/locales/lazy/auth_en.json';

const instance = createInstance();
void instance.init({
  lng: 'en',
  ns: ['auth', 'dndev'],
  defaultNS: 'auth',
  resources: { en: { auth, dndev } },
  interpolation: { escapeValue: false },
  initAsync: false,
});

/** Translate function of `namespace` (default `auth`) in English. */
export function localeT(namespace: string | string[] = 'auth') {
  const fixedT = instance.getFixedT('en', namespace);
  return (key: string, options?: TOptions): string => {
    const result = fixedT(key, options);
    return typeof result === 'string' ? result : key;
  };
}
