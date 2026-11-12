'use client';
// packages/features/auth/src/emailAuth/fields.tsx

/**
 * @fileoverview Email auth form pieces
 * @description `AuthForm` + fields for email/password forms. Compose them in any order,
 * add app-specific content between them; the flow (`useEmailSignIn`, `useEmailSignUp`,
 * `usePasswordResetRequest`) carries the behaviour. Each field brings its name,
 * autocomplete token (password managers), unique ids, ARIA error wiring and i18n.
 *
 * Inputs are uncontrolled (read at submit); the only per-keystroke state is the
 * password strength meter of the sign-up password field.
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */

import { createContext, use, useId, useState } from 'react';
import type { ReactNode } from 'react';

import {
  Alert,
  ALERT_VARIANT,
  Button,
  BUTTON_VARIANT,
  Checkbox,
  Dialog,
  Input,
  Label,
  PasswordInput,
  Stack,
  Text,
  cn,
} from '@donotdev/components';
import { useAppConfig, useTranslation } from '@donotdev/core';

import { useAuth } from '../useAuth';
import { PasswordStrengthIndicator } from '../components/PasswordStrengthIndicator';
import { AUTH_FIELD } from './flows';
import type { EmailAuthFlow } from './flows';

const FlowContext = createContext<EmailAuthFlow | null>(null);

/** The flow of the enclosing `AuthForm`. */
function useFlow(): EmailAuthFlow {
  const flow = use(FlowContext);
  if (!flow) throw new Error('Auth fields must be rendered inside <AuthForm>');
  return flow;
}

/** Props of {@link AuthForm}. */
export interface AuthFormProps {
  /** The flow this form runs (`useEmailSignIn()`, `useEmailSignUp()`, ...) */
  flow: EmailAuthFlow;
  /** Fields, app content, alerts, submit button */
  children: ReactNode;
  className?: string;
}

/**
 * The `<form>` of an email auth flow. A real form, so password managers pair the
 * fields and Enter submits. Shows an "unavailable" notice instead when the auth
 * provider failed to start.
 *
 * @param props - AuthFormProps
 * @returns The form
 */
export function AuthForm({ flow, children, className }: AuthFormProps) {
  const { t } = useTranslation('auth');
  if (flow.unavailable) {
    return (
      <Alert
        variant={ALERT_VARIANT.WARNING}
        title={t('unavailable.title', 'Authentication Unavailable')}
        description={t(
          'unavailable.description',
          'Sign-in is temporarily unavailable. Please try again later.'
        )}
      />
    );
  }
  return (
    <FlowContext value={flow}>
      <form
        noValidate
        onSubmit={flow.onSubmit}
        className={cn('dndev-auth-form', className)}
      >
        <Stack>{children}</Stack>
      </form>
    </FlowContext>
  );
}

/** Validation message under a field, wired to it by id. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <Text as="span" level="caption" variant="destructive" id={id} role="alert">
      {message}
    </Text>
  );
}

/** Props shared by the text fields. */
export interface AuthTextFieldProps {
  /** Label (default: translated "Email" / "Password") */
  label?: string;
  /** Placeholder (default: translated) */
  placeholder?: string;
  /** Initial value */
  defaultValue?: string;
}

/**
 * Email field (`name="email"`, `autocomplete="username"`: the identifier password
 * managers pair with the password).
 *
 * @param props - AuthTextFieldProps
 * @returns The field
 */
export function AuthEmailField({
  label,
  placeholder,
  defaultValue,
}: AuthTextFieldProps) {
  const { t } = useTranslation('auth');
  const flow = useFlow();
  const inputId = useId();
  const errorId = useId();
  const error = flow.fieldErrors.email;
  return (
    <Stack gap="tight">
      <Input
        id={inputId}
        name={AUTH_FIELD.EMAIL}
        type="email"
        autoComplete="username"
        label={label ?? t('email', 'Email')}
        placeholder={placeholder ?? t('emailPlaceholder', 'Enter your email')}
        defaultValue={defaultValue}
        disabled={flow.busy}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        data-variant={error ? 'destructive' : undefined}
        className="dndev-w-full"
      />
      <FieldError id={errorId} message={error} />
    </Stack>
  );
}

/**
 * Password field. Sign-in: `current-password`. Sign-up: `new-password` and a strength
 * meter with the policy requirements.
 *
 * @param props - AuthTextFieldProps
 * @returns The field
 */
export function AuthPasswordField({ label, placeholder }: AuthTextFieldProps) {
  const { t } = useTranslation('auth');
  const flow = useFlow();
  const inputId = useId();
  const errorId = useId();
  const [typed, setTyped] = useState('');
  const isNew = flow.mode === 'signup';
  const error = flow.fieldErrors.password;
  return (
    <Stack gap="tight">
      <PasswordInput
        id={inputId}
        name={AUTH_FIELD.PASSWORD}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        label={label ?? t('password', 'Password')}
        placeholder={
          placeholder ?? t('passwordPlaceholder', 'Enter your password')
        }
        onInput={
          isNew
            ? (e) => setTyped((e.target as HTMLInputElement).value)
            : undefined
        }
        disabled={flow.busy}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        data-variant={error ? 'destructive' : undefined}
        className="dndev-w-full"
      />
      <FieldError id={errorId} message={error} />
      {isNew && typed !== '' && (
        <PasswordStrengthIndicator
          password={typed}
          minLength={flow.passwordMinLength}
          showRequirements
        />
      )}
    </Stack>
  );
}

/**
 * Second password entry (sign-up, `name="confirmPassword"`). Rendering it makes the
 * flow require a match.
 *
 * @param props - AuthTextFieldProps
 * @returns The field
 */
export function AuthConfirmPasswordField({
  label,
  placeholder,
}: AuthTextFieldProps) {
  const { t } = useTranslation('auth');
  const flow = useFlow();
  const inputId = useId();
  const errorId = useId();
  const error = flow.fieldErrors.confirmPassword;
  return (
    <Stack gap="tight">
      <PasswordInput
        id={inputId}
        name={AUTH_FIELD.CONFIRM_PASSWORD}
        autoComplete="new-password"
        label={label ?? t('confirmPassword', 'Confirm Password')}
        placeholder={
          placeholder ??
          t('confirmPasswordPlaceholder', 'Re-enter your password')
        }
        disabled={flow.busy}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        data-variant={error ? 'destructive' : undefined}
        className="dndev-w-full"
      />
      <FieldError id={errorId} message={error} />
    </Stack>
  );
}

/** Props of {@link AuthRememberMeField}. */
export interface AuthRememberMeFieldProps {
  /** Label (default: translated "Remember me") */
  label?: string;
  /**
   * Initial state.
   * @default true (sessions persist unless the user opts out)
   */
  defaultChecked?: boolean;
}

/**
 * "Remember me" (sign-in, `name="rememberMe"`). Rendered only when the auth provider
 * can honour it; unticked = the session ends with the browser session.
 *
 * @param props - AuthRememberMeFieldProps
 * @returns The checkbox, or nothing when the provider cannot do it
 */
export function AuthRememberMeField({
  label,
  defaultChecked = true,
}: AuthRememberMeFieldProps) {
  const { t } = useTranslation('auth');
  const flow = useFlow();
  const canRememberMe = useAuth('canRememberMe');
  if (!flow.ready || !canRememberMe()) return null;
  return (
    <Checkbox
      name={AUTH_FIELD.REMEMBER_ME}
      defaultChecked={defaultChecked}
      disabled={flow.busy}
      label={label ?? t('rememberMe', 'Remember me')}
    />
  );
}

/** A link button that flows inside the consent sentence. */
const INLINE_LINK_STYLE = {
  minHeight: 'auto',
  padding: 0,
  display: 'inline',
} as const;

/** Legal document: a path (opened in a new tab) or content (shown in a dialog). */
export type AuthLegalDocument = string | ReactNode;

/** Props of {@link AuthConsentField}. */
export interface AuthConsentFieldProps {
  /** Terms of Service. Omit: from app config legal links, else `/legal/terms`. `false`: none */
  tos?: AuthLegalDocument | false;
  /** Privacy policy. Omit: from app config legal links, else `/legal/privacy`. `false`: none */
  privacy?: AuthLegalDocument | false;
}

function LegalLink({
  label,
  document,
}: {
  label: string;
  document: AuthLegalDocument;
}) {
  const [open, setOpen] = useState(false);
  const isPath = typeof document === 'string';
  return (
    <>
      <Button
        type="button"
        variant={BUTTON_VARIANT.LINK}
        onClick={() =>
          isPath
            ? window.open(document, '_blank', 'noopener,noreferrer')
            : setOpen(true)
        }
        className="dndev-p-0 dndev-h-auto"
        style={INLINE_LINK_STYLE}
      >
        {label}
      </Button>
      {!isPath && (
        <Dialog open={open} onOpenChange={setOpen} title={label} showClose>
          {document}
        </Dialog>
      )}
    </>
  );
}

/**
 * Terms / privacy consent (sign-up, `name="consent"`, GDPR). Rendering it makes the
 * flow require it and record `gdpr_consent_at`.
 *
 * @param props - AuthConsentFieldProps
 * @returns The checkbox and links, or nothing when both documents are `false`
 */
export function AuthConsentField({ tos, privacy }: AuthConsentFieldProps) {
  const { t } = useTranslation('auth');
  const flow = useFlow();
  const appConfig = useAppConfig('app');
  const id = useId();
  const errorId = useId();
  const legalPath = (match: string, standard: string) =>
    appConfig?.footer?.legalLinks?.find((l) => l.path.includes(match))?.path ??
    standard;
  const tosDoc = tos === undefined ? legalPath('terms', '/legal/terms') : tos;
  const privacyDoc =
    privacy === undefined ? legalPath('privacy', '/legal/privacy') : privacy;
  if (tosDoc === false && privacyDoc === false) return null;
  const error = flow.fieldErrors.consent;
  return (
    <Stack gap="tight">
      <Stack direction="row" gap="tight" align="start">
        <Checkbox
          id={id}
          name={AUTH_FIELD.CONSENT}
          disabled={flow.busy}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
        <Label htmlFor={id}>
          <Text as="span" level="caption">
            {t('terms.accept_prefix', 'I accept the')}{' '}
            {tosDoc !== false && (
              <LegalLink label={t('terms.tos', 'Terms of Service')} document={tosDoc} />
            )}
            {tosDoc !== false && privacyDoc !== false && (
              <> {t('terms.and', 'and')} </>
            )}
            {privacyDoc !== false && (
              <LegalLink
                label={t('terms.privacy', 'Privacy Policy')}
                document={privacyDoc}
              />
            )}
          </Text>
        </Label>
      </Stack>
      <FieldError id={errorId} message={error} />
    </Stack>
  );
}

/**
 * Form-level messages: provider error / throttle, and a resend action when sign-in
 * failed on an unconfirmed address.
 *
 * @returns The alerts, or nothing
 */
export function AuthFormAlerts() {
  const { t } = useTranslation('auth');
  const flow = useFlow();
  if (!flow.error) return null;
  const unconfirmed = flow.unconfirmedEmail;
  return (
    <Stack gap="tight">
      <Alert variant={ALERT_VARIANT.ERROR} description={flow.error} />
      {unconfirmed && (
        <Button
          type="button"
          variant={BUTTON_VARIANT.LINK}
          onClick={() => void flow.resendVerification(unconfirmed)}
        >
          {t('signup.resend_verification', 'Resend verification email')}
        </Button>
      )}
    </Stack>
  );
}

/** Props of {@link AuthSubmitButton}. */
export interface AuthSubmitButtonProps {
  /** Label (default: translated per flow) */
  children?: ReactNode;
}

/**
 * Submit button: full width, loading while the flow runs, disabled until the provider
 * is ready and while CAPTCHA / throttle block.
 *
 * @param props - AuthSubmitButtonProps
 * @returns The button
 */
export function AuthSubmitButton({ children }: AuthSubmitButtonProps) {
  const { t } = useTranslation('auth');
  const flow = useFlow();
  const standard =
    flow.mode === 'signup'
      ? t('actions.sign_up_submit', 'Sign Up')
      : flow.mode === 'reset'
        ? t('forgotPassword.submit', 'Send reset link')
        : t('actions.sign_in_submit', 'Sign In');
  return (
    <Button
      type="submit"
      variant={BUTTON_VARIANT.PRIMARY}
      fullWidth
      loading={flow.busy}
      disabled={!flow.ready || flow.blocked}
    >
      {children ?? standard}
    </Button>
  );
}
