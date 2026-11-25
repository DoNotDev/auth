// packages/features/auth/src/emailAuth/__tests__/codeConfirmation.test.tsx

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DoNotDevError } from '@donotdev/core';

import {
  AuthCodeField,
  AuthEmailField,
  AuthForm,
  AuthFormAlerts,
  AuthPasswordField,
  AuthSubmitButton,
} from '../fields';
import { useEmailCodeConfirmation, useEmailSignUp } from '../flows';
import type { EmailCodeConfirmationOptions, EmailSignUpOptions } from '../flows';

const api = {
  isAvailable: true,
  status: 'ready',
  createUserWithEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  verifyEmailCode: vi.fn(),
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

vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/core')>();
  const { localeT } = await import('./localeT');
  return {
    ...actual,
    useAppConfig: () => undefined,
    useTranslation: (namespace?: string | string[]) => ({
      t: localeT(namespace),
      i18n: { language: 'fr' },
      language: 'fr',
    }),
  };
});

// No network in tests: the breached-password API answers "not found".
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response('', { status: 200 }))
);

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const submitSignUp = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Create account$/ }));
  });
};

function SignUp(props: EmailSignUpOptions) {
  const flow = useEmailSignUp(props);
  return (
    <AuthForm flow={flow}>
      <AuthEmailField />
      <AuthPasswordField />
      <AuthFormAlerts />
      <AuthSubmitButton />
    </AuthForm>
  );
}

const signUp = async (props: EmailSignUpOptions, password = 'Str0ng!pass') => {
  render(<SignUp {...props} />);
  type(/^Email$/, ' pro@b.co ');
  type(/^Password$/, password);
  await submitSignUp();
  // The breached-password check (SHA-1 + fetch) runs before the provider call.
  await waitFor(() => {
    // Done: the provider was called, or a form error (alert) / field error (aria-invalid) shows
    const failed =
      screen.queryByRole('alert') || document.querySelector('[aria-invalid="true"]');
    if (api.createUserWithEmail.mock.calls.length === 0 && !failed) {
      throw new Error('sign-up still running');
    }
  });
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useEmailSignUp with confirmation: code', () => {
  it('new address: awaits confirmation with the address, no toast', async () => {
    api.createUserWithEmail.mockResolvedValue({
      success: true,
      user: { emailVerified: false },
    });
    const onSuccess = vi.fn();
    await signUp({ confirmation: 'code', onSuccess });
    expect(onSuccess).toHaveBeenCalledWith({
      awaitingConfirmation: true,
      email: 'pro@b.co',
    });
    expect(toast).not.toHaveBeenCalled();
    expect(api.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('autoconfirmed project: signed in at once', async () => {
    api.createUserWithEmail.mockResolvedValue({
      success: true,
      user: { emailVerified: true },
    });
    const onSuccess = vi.fn();
    await signUp({ confirmation: 'code', onSuccess });
    expect(onSuccess).toHaveBeenCalledWith({
      awaitingConfirmation: false,
      email: 'pro@b.co',
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it('existing address: same outcome as a new one, and one reset email is sent', async () => {
    api.createUserWithEmail.mockRejectedValue(
      new Error('An account with this email already exists')
    );
    api.sendPasswordResetEmail.mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    await signUp({ confirmation: 'code', onSuccess });
    expect(onSuccess).toHaveBeenCalledWith({
      awaitingConfirmation: true,
      email: 'pro@b.co',
    });
    expect(api.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(api.sendPasswordResetEmail).toHaveBeenCalledWith('pro@b.co');
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('existing address: a failing reset email is logged, never shown, outcome unchanged', async () => {
    api.createUserWithEmail.mockRejectedValue(
      Object.assign(new Error('Conflict'), { code: 'user_already_exists' })
    );
    api.sendPasswordResetEmail.mockRejectedValue(new Error('rate limited'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSuccess = vi.fn();
    const onError = vi.fn();
    await signUp({ confirmation: 'code', onSuccess, onError });
    await act(async () => {});
    expect(onSuccess).toHaveBeenCalledWith({
      awaitingConfirmation: true,
      email: 'pro@b.co',
    });
    expect(api.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    logged.mockRestore();
  });

  it('toast mode (default) keeps the toast and adds the address to the outcome', async () => {
    api.createUserWithEmail.mockResolvedValue({
      success: true,
      user: { emailVerified: false },
    });
    const onSuccess = vi.fn();
    await signUp({ onSuccess });
    expect(onSuccess).toHaveBeenCalledWith({
      awaitingConfirmation: true,
      email: 'pro@b.co',
    });
    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe('useEmailSignUp passwordComposition', () => {
  it('false: a long enough password without character classes is accepted', async () => {
    api.createUserWithEmail.mockResolvedValue({
      success: true,
      user: { emailVerified: true },
    });
    await signUp({ passwordComposition: false }, 'longpassword');
    expect(api.createUserWithEmail).toHaveBeenCalledWith(
      'pro@b.co',
      'longpassword',
      undefined
    );
  });

  it('false: the minimum length still applies', async () => {
    await signUp({ passwordComposition: false }, 'short');
    expect(
      screen.getByText('Password must be at least 8 characters')
    ).toBeTruthy();
    expect(api.createUserWithEmail).not.toHaveBeenCalled();
  });

  it('default: the composition rules apply', async () => {
    await signUp({}, 'longpassword');
    expect(
      screen.getByText('Password must contain at least one uppercase letter')
    ).toBeTruthy();
    expect(api.createUserWithEmail).not.toHaveBeenCalled();
  });
});

describe('useEmailCodeConfirmation + AuthCodeField', () => {
  const options = (
    extra: Partial<EmailCodeConfirmationOptions> = {}
  ): EmailCodeConfirmationOptions => ({
    email: 'pro@b.co',
    length: 8,
    resendCooldownSeconds: 3,
    ...extra,
  });

  function CodeStep(props: EmailCodeConfirmationOptions) {
    const confirmation = useEmailCodeConfirmation(props);
    return <AuthCodeField confirmation={confirmation} />;
  }

  const paste = async (code: string) => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Confirmation code'), {
        target: { value: code },
      });
    });
  };

  it('submits the code once complete and hands over the signed-in user', async () => {
    const user = { id: 'u1', emailVerified: true };
    api.verifyEmailCode.mockResolvedValue(user);
    const onSuccess = vi.fn();
    render(<CodeStep {...options({ onSuccess })} />);
    await paste('12345678');
    expect(api.verifyEmailCode).toHaveBeenCalledWith('pro@b.co', '12345678');
    expect(onSuccess).toHaveBeenCalledWith(user);
  });

  it('a wrong code shows the translated error and clears the code', async () => {
    const error = new DoNotDevError('Token has expired or is invalid', 'unknown', {
      details: { originalCode: 'otp_expired' },
    });
    api.verifyEmailCode.mockRejectedValue(error);
    const onError = vi.fn();
    render(<CodeStep {...options({ onError })} />);
    await paste('12345678');
    expect(
      screen.getByText(
        'This code is incorrect or has expired. Check the email or request a new code.'
      )
    ).toBeTruthy();
    expect(
      (screen.getByLabelText('Confirmation code') as HTMLInputElement).value
    ).toBe('');
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('an incomplete code is not sent', async () => {
    const { result } = renderHook(() => useEmailCodeConfirmation(options()));
    await act(async () => {
      await result.current.submit('123');
    });
    expect(api.verifyEmailCode).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Enter the 8-digit code.');
  });

  it('defaults: 6 characters, 60 seconds before a resend', () => {
    const { result } = renderHook(() =>
      useEmailCodeConfirmation({ email: 'pro@b.co' })
    );
    expect(result.current.length).toBe(6);
    expect(result.current.resendIn).toBe(60);
    expect(result.current.ready).toBe(true);
  });

  it('counts down, then resends and restarts the countdown', async () => {
    vi.useFakeTimers();
    api.sendEmailVerification.mockResolvedValue(undefined);
    render(<CodeStep {...options()} />);
    const button = () =>
      screen.getByRole('button', { name: /Resend code/ }) as HTMLButtonElement;
    expect(button().textContent).toContain('Resend code in 3 s');
    expect(button().disabled).toBe(true);
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(button().textContent).toBe('Resend code');
    expect(button().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button());
    });
    expect(api.sendEmailVerification).toHaveBeenCalledWith('pro@b.co');
    // No toast: the confirmation is inline under the code
    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('A new code has been sent.');
    expect(button().textContent).toContain('Resend code in 3 s');
  });

  it('a resend gives the focus back to the code input', async () => {
    api.sendEmailVerification.mockResolvedValue(undefined);
    render(<CodeStep {...options({ resendCooldownSeconds: 0 })} />);
    const button = screen.getByRole('button', { name: /Resend code/ });
    button.focus();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(api.sendEmailVerification).toHaveBeenCalledWith('pro@b.co');
    expect(document.activeElement).toBe(screen.getByLabelText('Confirmation code'));
  });

  it('resend is a no-op while the countdown runs', async () => {
    const { result } = renderHook(() => useEmailCodeConfirmation(options()));
    await act(async () => {
      await result.current.resend();
    });
    expect(api.sendEmailVerification).not.toHaveBeenCalled();
  });
});
