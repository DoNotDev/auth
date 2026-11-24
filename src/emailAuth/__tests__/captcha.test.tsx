// packages/features/auth/src/emailAuth/__tests__/captcha.test.tsx

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthCodeStep, AuthEmailField, AuthForm, AuthFormAlerts, AuthSubmitButton } from '../fields';
import { useEmailSignIn, usePasswordResetRequest } from '../flows';
import { authErrorMessage, codeErrorMessage, isCaptchaError } from '../rules';
import type { AuthT } from '../rules';

import { localeT } from './localeT';

const api = {
  isAvailable: true,
  status: 'ready',
  signInWithEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  verifyEmailCode: vi.fn(),
  setRememberMe: vi.fn(),
  canRememberMe: vi.fn(() => false),
};

vi.mock('../../useAuth', () => ({
  useAuth: (key: keyof typeof api) => api[key],
}));

const toast = vi.fn();
vi.mock('@donotdev/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/components')>();
  return { ...actual, toast: (...args: unknown[]) => toast(...args) };
});

const captcha = {
  siteKey: undefined as string | undefined,
  remove: vi.fn(),
  mount: vi.fn(),
};

vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/core')>();
  const { localeT } = await import('./localeT');
  return {
    ...actual,
    useAppConfig: () => undefined,
    getCaptchaSiteKey: () => captcha.siteKey,
    mountCaptchaWidget: (container: HTMLElement, options: { language: string }) => {
      captcha.mount(container, options);
      return { take: vi.fn(), remove: captcha.remove };
    },
    useTranslation: (namespace?: string | string[]) => ({
      t: localeT(namespace),
      i18n: { language: 'fr' },
      language: 'fr',
    }),
  };
});

const authT = localeT();
const t: AuthT = (key, _fallback, values) => authT(key, values);
const CAPTCHA_MESSAGE = 'The security check failed. Please try again.';
const captchaFailure = () =>
  Object.assign(new Error('captcha verification failed: widget error 300010'), {
    code: 'captcha_failed',
  });

beforeEach(() => {
  vi.clearAllMocks();
  captcha.siteKey = undefined;
});

describe('CAPTCHA errors', () => {
  it('recognises the GoTrue code and the code kept by wrapAuthError, never the message', () => {
    expect(isCaptchaError({ code: 'captcha_failed' })).toBe(true);
    expect(
      isCaptchaError({ code: 'unknown', details: { originalCode: 'captcha_failed' } })
    ).toBe(true);
    // The wrapped message carries the address: "captcha" in it is not a CAPTCHA failure.
    expect(
      isCaptchaError(
        Object.assign(
          new Error('SupabaseAuth.signInWithEmailAndPassword({"email":"captcha@b.co"}): Invalid login credentials'),
          { code: 'unknown', details: { originalCode: 'invalid_credentials' } }
        )
      )
    ).toBe(false);
  });

  it('maps to errors.captcha_failed in the form and in the code step', () => {
    expect(authErrorMessage(captchaFailure(), t)).toBe(CAPTCHA_MESSAGE);
    expect(codeErrorMessage(captchaFailure(), t)).toBe(CAPTCHA_MESSAGE);
  });
});

describe('CAPTCHA in the flows', () => {
  function Reset() {
    const flow = usePasswordResetRequest();
    return (
      <AuthForm flow={flow}>
        <AuthEmailField />
        <AuthFormAlerts />
        <AuthSubmitButton />
        {flow.sent && <span role="status">sent</span>}
      </AuthForm>
    );
  }

  function SignIn() {
    const flow = useEmailSignIn();
    return (
      <AuthForm flow={flow}>
        <AuthEmailField />
        <AuthFormAlerts />
        <AuthSubmitButton />
      </AuthForm>
    );
  }

  it('password reset: a CAPTCHA failure is the inline error, never "sent", no toast', async () => {
    api.sendPasswordResetEmail.mockRejectedValue(captchaFailure());
    render(<Reset />);
    fireEvent.change(screen.getByLabelText(/^Email$/), {
      target: { value: 'who@b.co' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send reset link/ }));
    });
    expect(screen.getByText(CAPTCHA_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('no site key: no widget is mounted', () => {
    render(<SignIn />);
    expect(captcha.mount).not.toHaveBeenCalled();
  });

  it('site key set: the widget mounts above the submit button, in the app language, removed on unmount', () => {
    captcha.siteKey = '1x00000000000000000000AA';
    const { unmount } = render(<SignIn />);
    expect(captcha.mount).toHaveBeenCalledTimes(1);
    const [container, options] = captcha.mount.mock.calls[0] as [HTMLElement, { language: string }];
    expect(options).toEqual({ language: 'fr' });
    const button = screen.getByRole('button', { name: /Sign In/ });
    expect(container.nextElementSibling).toBe(button);
    unmount();
    expect(captcha.remove).toHaveBeenCalledTimes(1);
  });

  it('site key set: the code step mounts a widget for its resend', () => {
    captcha.siteKey = '1x00000000000000000000AA';
    render(<AuthCodeStep email="who@b.co" />);
    expect(captcha.mount).toHaveBeenCalledTimes(1);
  });
});
