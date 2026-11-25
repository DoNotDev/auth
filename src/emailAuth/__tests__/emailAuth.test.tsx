// packages/features/auth/src/emailAuth/__tests__/emailAuth.test.tsx

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EmailPasswordForm from '../../components/EmailPasswordForm';

const api = {
  isAvailable: true,
  status: 'ready',
  signInWithEmail: vi.fn(),
  createUserWithEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  setRememberMe: vi.fn(),
  canRememberMe: vi.fn(() => true),
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
      i18n: { language: 'en' },
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

const submit = async (name: RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  api.canRememberMe.mockReturnValue(true);
});

describe('EmailPasswordForm on the email auth pieces', () => {
  it('signs in with remember me ticked by default, then calls onSuccess', async () => {
    api.signInWithEmail.mockResolvedValue({ success: true, user: {} });
    const onSuccess = vi.fn();
    render(<EmailPasswordForm onSuccess={onSuccess} />);
    type(/^Email$/, 'a@b.co');
    type(/^Password$/, 'secret');
    await submit(/^Sign In$/);
    expect(api.setRememberMe).toHaveBeenCalledWith(true);
    expect(api.signInWithEmail).toHaveBeenCalledWith('a@b.co', 'secret');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('applies an unticked remember me as a session-only sign-in', async () => {
    api.signInWithEmail.mockResolvedValue({ success: true, user: {} });
    render(<EmailPasswordForm />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Remember me/ }));
    type(/^Email$/, 'a@b.co');
    type(/^Password$/, 'secret');
    await submit(/^Sign In$/);
    expect(api.setRememberMe).toHaveBeenCalledWith(false);
  });

  it('hides remember me when the provider cannot honour it', () => {
    api.canRememberMe.mockReturnValue(false);
    render(<EmailPasswordForm />);
    expect(screen.queryByRole('checkbox', { name: /Remember me/ })).toBeNull();
  });

  it('validates fields at submit without calling the provider', async () => {
    render(<EmailPasswordForm />);
    type(/^Email$/, 'not-an-email');
    await submit(/^Sign In$/);
    expect(screen.getByText('Invalid email address')).toBeTruthy();
    expect(screen.getByText('Password is required')).toBeTruthy();
    expect(api.signInWithEmail).not.toHaveBeenCalled();
  });

  it('offers a resend to the typed address when it was never confirmed', async () => {
    api.signInWithEmail.mockRejectedValue(new Error('Email not confirmed'));
    api.sendEmailVerification.mockResolvedValue(undefined);
    render(<EmailPasswordForm />);
    type(/^Email$/, 'new@b.co');
    type(/^Password$/, 'secret');
    await submit(/^Sign In$/);
    expect(
      screen.getByText('Please verify your email before signing in.')
    ).toBeTruthy();
    await submit(/Resend verification email/);
    expect(api.sendEmailVerification).toHaveBeenCalledWith('new@b.co');
  });

  it('signs up: closes at once and confirms with a persistent toast that can resend', async () => {
    api.createUserWithEmail.mockResolvedValue({
      success: true,
      user: { emailVerified: false },
    });
    const onSuccess = vi.fn();
    render(
      <EmailPasswordForm
        mode="signup"
        tos={false}
        privacy={false}
        onSuccess={onSuccess}
      />
    );
    type(/^Email$/, 'pro@b.co');
    type(/^Password$/, 'Str0ng!pass');
    type(/^Confirm Password$/, 'Str0ng!pass');
    await submit(/^Create account$/);
    expect(api.createUserWithEmail).toHaveBeenCalledWith(
      'pro@b.co',
      'Str0ng!pass',
      undefined
    );
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    const [options] = toast.mock.calls[0]!;
    expect(options).toMatchObject({ duration: 0, toastType: 'success' });
    // The Resend action resends to the address typed at sign-up
    api.sendEmailVerification.mockResolvedValue(undefined);
    render(options.action);
    await submit(/Resend Email/);
    expect(api.sendEmailVerification).toHaveBeenCalledWith('pro@b.co');
  });

  it('ends a sign-up on an existing address exactly like a new one', async () => {
    api.createUserWithEmail.mockRejectedValue(
      new Error('User already registered')
    );
    const onSuccess = vi.fn();
    render(
      <EmailPasswordForm
        mode="signup"
        tos={false}
        privacy={false}
        onSuccess={onSuccess}
      />
    );
    type(/^Email$/, 'pro@b.co');
    type(/^Password$/, 'Str0ng!pass');
    type(/^Confirm Password$/, 'Str0ng!pass');
    await submit(/^Create account$/);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]![0]).toMatchObject({ duration: 0 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('requires matching passwords and consent when those fields are rendered', async () => {
    render(<EmailPasswordForm mode="signup" />);
    type(/^Email$/, 'pro@b.co');
    type(/^Password$/, 'Str0ng!pass');
    type(/^Confirm Password$/, 'other');
    await submit(/^Create account$/);
    expect(screen.getByText('Passwords do not match')).toBeTruthy();
    expect(
      screen.getByText('Please accept the terms to continue')
    ).toBeTruthy();
    expect(api.createUserWithEmail).not.toHaveBeenCalled();
  });

  // The message slot (FieldMessage) is mounted before any error: a hidden, empty live
  // region that the error is written into on submit, the field wired to it.
  it('writes the error into the field message slot mounted before it', async () => {
    render(<EmailPasswordForm mode="signup" tos={false} privacy={false} />);
    const email = screen.getByLabelText(/^Email$/);
    const slot = () => email.closest('fieldset')!.nextElementSibling as HTMLElement;
    const before = slot();
    expect(before.dataset.state).toBe('empty');
    expect(before.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(email.hasAttribute('aria-describedby')).toBe(false);
    await submit(/^Create account$/);
    expect(slot()).toBe(before);
    expect(before.dataset.state).toBe('error');
    expect(before.textContent).not.toBe('');
    expect(email.getAttribute('aria-describedby')).toBe(before.id);
    expect(email.getAttribute('aria-invalid')).toBe('true');
  });

  it('requests a password reset from the typed email, closes, and toasts', async () => {
    api.sendPasswordResetEmail.mockRejectedValue(new Error('User not found'));
    const onSuccess = vi.fn();
    render(<EmailPasswordForm onSuccess={onSuccess} />);
    type(/^Email$/, 'who@b.co');
    fireEvent.click(screen.getByRole('button', { name: /Forgot Password\?/ }));
    expect((screen.getByLabelText(/^Email$/) as HTMLInputElement).value).toBe(
      'who@b.co'
    );
    await submit(/Send reset link/);
    expect(api.sendPasswordResetEmail).toHaveBeenCalledWith('who@b.co');
    // Anti-enumeration: "no such account" ends like success
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]![0]).toMatchObject({ duration: 0 });
  });
});
