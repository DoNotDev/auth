'use client';
// packages/features/auth/src/emailAuth/captcha.tsx

/**
 * @fileoverview CAPTCHA widget of the auth forms
 * @description The Turnstile widget the framework auth forms render just above their
 * submit button (`AuthSubmitButton`), the code step above its Resend button
 * (`AuthCodeField`) and the email-link form above its submit. Nothing renders without
 * the public env var `TURNSTILE_SITE_KEY` (CAPTCHA off). While mounted, the widget is
 * where the provider takes the token of each gated call (`getCaptchaToken`,
 * `@donotdev/core`); tokens, script loading and failures: `mountCaptchaWidget`.
 *
 * @version 0.1.0
 * @since 0.3.4
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useRef } from 'react';

import { Stack } from '@donotdev/components';
import {
  getCaptchaSiteKey,
  mountCaptchaWidget,
  useTranslation,
} from '@donotdev/core';

/**
 * The Turnstile widget (theme `auto`, the app's language, full width). Hidden until
 * Cloudflare asks the visitor to interact (Managed widget); an Invisible widget never
 * shows. Renders nothing without `TURNSTILE_SITE_KEY`.
 *
 * @returns The widget container, or nothing
 */
export function AuthCaptcha() {
  const { language } = useTranslation('auth');
  const container = useRef<HTMLDivElement>(null);
  const siteKey = getCaptchaSiteKey();

  useEffect(() => {
    if (!siteKey || !container.current) return;
    const widget = mountCaptchaWidget(container.current, { language });
    return () => widget.remove();
  }, [siteKey, language]);

  if (!siteKey) return null;
  // Turnstile renders its iframe inside: React gives this container no children.
  return <Stack ref={container}>{null}</Stack>;
}
