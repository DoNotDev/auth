// packages/features/auth/src/emailAuth/__tests__/classicFlow.test.tsx

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EmailPasswordForm from '../../components/EmailPasswordForm';
import {
  AuthCodeStep,
  AuthEmailField,
  AuthForm,
  AuthFormAlerts,
  AuthNameField,
  AuthPasswordField,
  AuthSubmitButton,
} from '../fields';
import {
  useEmailCodeConfirmation,
  useEmailSignIn,
  useEmailSignUp,
  usePasswordResetRequest,
} from '../flows';
import type { EmailSignInOptions, PasswordResetRequestOptions } from '../flows';

const api = {
  isAvailable: true,
  status: 'ready',
  signInWithEmail: vi.fn(),
  createUserWithEmail: vi.fn(),
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

vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/core')>();
  return {
    ...actual,
    useAppConfig: () => undefined,
    useTranslation: () => ({
      // Fallback (string or `defaultValue`), with {{name}} interpolation
      t: (
        key: string,
        options?: string | ({ defaultValue?: string } & Record<string, unknown>)
      ) => {
        const text =
          (typeof options === 'string' ? options : options?.defaultValue) ?? key;
        const vars = typeof options === 'object' ? options : {};
        return text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
          String(vars[name])
        );
      },
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

const click = async (name: RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

/** Sign-up done: the breached-password check runs before the provider call. */
const signedUp = () =>
  waitFor(() => expect(api.createUserWithEmail).toHaveBeenCalled());

beforeEach(() => {
  vi.clearAllMocks();
  api.canRememberMe.mockReturnValue(false);
});

describe('useEmailCodeConfirmation resend: no toast', () => {
  it('a failed resend sets the inline error; the next resend clears it', async () => {
    api.sendEmailVerification.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      useEmailCodeConfirmation({ email: 'pro@b.co', resendCooldownSeconds: 0 })
    );
    await act(async () => { await result.current.resend(); });
    expect(result.current.error).not.toBeNull();
    expect(result.current.resent).toBe(false);
    api.sendEmailVerification.mockResolvedValueOnce(undefined);
    await act(async () => { await result.current.resend(); });
    expect(result.current.error).toBeNull();
    expect(result.current.resent).toBe(true);
    expect(toast).not.toHaveBeenCalled();
  });

  it('resent lasts until the next submit', async () => {
    api.sendEmailVerification.mockResolvedValue(undefined);
    api.verifyEmailCode.mockRejectedValue(new Error('invalid'));
    const { result } = renderHook(() =>
      useEmailCodeConfirmation({ email: 'pro@b.co', resendCooldownSeconds: 0 })
    );
    await act(async () => { await result.current.resend(); });
    expect(result.current.resent).toBe(true);
    await act(async () => { await result.current.submit('123456'); });
    expect(result.current.resent).toBe(false);
  });
});

describe('AuthNameField', () => {
  function SignUp() {
    const flow = useEmailSignUp({ confirmation: 'code' });
    return (
      <AuthForm flow={flow}>
        <AuthNameField info="How should we call you?" />
        <AuthEmailField />
        <AuthPasswordField />
        <AuthSubmitButton />
      </AuthForm>
    );
  }

  const signUp = async (name: string) => {
    api.createUserWithEmail.mockResolvedValue({ success: true, user: { emailVerified: false } });
    render(<SignUp />);
    type(/^Name$/, name);
    type(/^Email$/, 'pro@b.co');
    type(/^Password$/, 'Str0ng!pass');
    await click(/^Create account$/);
    await signedUp();
    return api.createUserWithEmail.mock.calls[0]![2];
  };

  it('stores the trimmed name as full_name', async () => {
    expect(await signUp('  So Hee  ')).toEqual({ full_name: 'So Hee' });
  });

  it('empty: stores nothing and is never required', async () => {
    expect(await signUp('   ')).toBeUndefined();
  });

  it('shows the help (i) next to the label', () => {
    render(<SignUp />);
    expect(screen.getByRole('button', { name: 'How should we call you?' })).toBeTruthy();
  });
});

describe('useEmailSignIn confirmation', () => {
  function SignIn(props: EmailSignInOptions) {
    const flow = useEmailSignIn(props);
    return (
      <AuthForm flow={flow}>
        <AuthEmailField />
        <AuthPasswordField />
        <AuthFormAlerts />
        <AuthSubmitButton />
      </AuthForm>
    );
  }

  const signIn = async (props: EmailSignInOptions) => {
    api.signInWithEmail.mockResolvedValue({ success: false, error: 'Email not confirmed' });
    api.sendEmailVerification.mockResolvedValue(undefined);
    render(<SignIn {...props} />);
    type(/^Email$/, ' new@b.co ');
    type(/^Password$/, 'secret');
    await click(/^Sign In$/);
  };

  it("code: an unconfirmed address gets a fresh code and onCodeSent, no error", async () => {
    const onCodeSent = vi.fn();
    const onSuccess = vi.fn();
    await signIn({ confirmation: 'code', onCodeSent, onSuccess });
    expect(api.sendEmailVerification).toHaveBeenCalledWith('new@b.co');
    expect(onCodeSent).toHaveBeenCalledWith('new@b.co');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Resend verification email/ })).toBeNull();
  });

  it('code: a rate-limited resend still shows the code step (the sent code stays valid)', async () => {
    api.sendEmailVerification.mockRejectedValueOnce(
      new Error('email rate limit exceeded (429)')
    );
    const onCodeSent = vi.fn();
    await signIn({ confirmation: 'code', onCodeSent });
    expect(onCodeSent).toHaveBeenCalledWith('new@b.co');
    expect(screen.queryByText(/Authentication failed/)).toBeNull();
  });

  it('code: any other resend failure is the form error, no code step', async () => {
    api.sendEmailVerification.mockRejectedValueOnce(new Error('boom'));
    const onCodeSent = vi.fn();
    await signIn({ confirmation: 'code', onCodeSent });
    expect(onCodeSent).not.toHaveBeenCalled();
    expect(screen.getByText(/Authentication failed/)).toBeTruthy();
  });

  it('default: the error with a resend action, no code sent', async () => {
    const onCodeSent = vi.fn();
    await signIn({ onCodeSent });
    expect(api.sendEmailVerification).not.toHaveBeenCalled();
    expect(onCodeSent).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Resend verification email/ })).toBeTruthy();
  });
});

describe('usePasswordResetRequest toast', () => {
  function Reset(props: PasswordResetRequestOptions & { onSent?: (sent: boolean) => void }) {
    const flow = usePasswordResetRequest(props);
    return (
      <AuthForm flow={flow}>
        <AuthEmailField />
        <AuthSubmitButton />
        {flow.sent && <span role="status">sent</span>}
      </AuthForm>
    );
  }

  const request = async (props: PasswordResetRequestOptions) => {
    api.sendPasswordResetEmail.mockResolvedValue(undefined);
    render(<Reset {...props} />);
    type(/^Email$/, 'who@b.co');
    await click(/Send reset link/);
  };

  it('default: toasts; sent is true', async () => {
    await request({});
    expect(toast).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('toast: false: no toast; sent is true for the inline message', async () => {
    const onSuccess = vi.fn();
    await request({ toast: false, onSuccess });
    expect(toast).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});

describe('AuthCodeStep', () => {
  it('names the address and offers to change it', async () => {
    const onChangeEmail = vi.fn();
    render(<AuthCodeStep email="pro@b.co" onChangeEmail={onChangeEmail} />);
    expect(screen.getByText('Enter the code sent to pro@b.co')).toBeTruthy();
    await click(/Change address/);
    expect(onChangeEmail).toHaveBeenCalledTimes(1);
  });

  it('no onChangeEmail: no link', () => {
    render(<AuthCodeStep email="pro@b.co" />);
    expect(screen.queryByRole('button', { name: /Change address/ })).toBeNull();
  });
});

describe('EmailPasswordForm confirmation="code"', () => {
  it('sign-up → code step → signed in → onSuccess; no toast', async () => {
    api.createUserWithEmail.mockResolvedValue({ success: true, user: { emailVerified: false } });
    api.verifyEmailCode.mockResolvedValue({ id: 'u1', emailVerified: true });
    const onSuccess = vi.fn();
    render(<EmailPasswordForm mode="signup" confirmation="code" tos={false} privacy={false} onSuccess={onSuccess} />);
    type(/^Email$/, 'pro@b.co');
    type(/^Password$/, 'Str0ng!pass');
    type(/^Confirm Password$/, 'Str0ng!pass');
    await click(/^Create account$/);
    await signedUp();
    await screen.findByText('Enter the code sent to pro@b.co');
    expect(onSuccess).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Confirmation code'), { target: { value: '123456' } });
    });
    expect(api.verifyEmailCode).toHaveBeenCalledWith('pro@b.co', '123456');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it('sign-in of an unconfirmed address → code step; Change address goes back with the email', async () => {
    api.signInWithEmail.mockResolvedValue({ success: false, error: 'Email not confirmed' });
    api.sendEmailVerification.mockResolvedValue(undefined);
    render(<EmailPasswordForm confirmation="code" />);
    type(/^Email$/, 'new@b.co');
    type(/^Password$/, 'secret');
    await click(/^Sign In$/);
    expect(api.sendEmailVerification).toHaveBeenCalledWith('new@b.co');
    expect(screen.getByText('Enter the code sent to new@b.co')).toBeTruthy();
    await click(/Change address/);
    expect((screen.getByLabelText(/^Email$/) as HTMLInputElement).value).toBe('new@b.co');
  });
});
