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
 * password strength meter of the sign-up password field. While a submit runs, text
 * inputs are `readOnly`, never `disabled` (values and browser autofill stay painted
 * as they were; no muted fieldset).
 *
 * `AuthCodeField` is the exception: the code step, outside any `AuthForm`, driven by
 * `useEmailCodeConfirmation`; `AuthCodeStep` wraps both with the intro and "Change
 * address".
 *
 * @version 0.1.0
 * @since 0.2.3
 * @author AMBROISE PARK Consulting
 */

import { createContext, use, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  Alert,
  ALERT_VARIANT,
  Button,
  BUTTON_VARIANT,
  Checkbox,
  Dialog,
  FieldMessage,
  fieldMessageAria,
  Input,
  Label,
  PasswordInput,
  PinInput,
  Stack,
  Text,
  cn,
} from '@donotdev/components';
import { useAppConfig, useTranslation } from '@donotdev/core';
import type { AuthUser } from '@donotdev/core';

import { useAuth } from '../useAuth';
import { PasswordStrengthIndicator } from '../components/PasswordStrengthIndicator';
import { AuthCaptcha } from './captcha';
import { AUTH_FIELD, useEmailCodeConfirmation } from './flows';
import type { EmailAuthFlow, EmailCodeConfirmation } from './flows';

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
        title={t('unavailable.title')}
        description={t('unavailable.description')}
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
        label={label ?? t('email')}
        placeholder={placeholder ?? t('emailPlaceholder')}
        defaultValue={defaultValue}
        readOnly={flow.busy}
        {...fieldMessageAria({ id: errorId, error })}
        data-variant={error ? 'destructive' : undefined}
        className="dndev-w-full"
      />
      <FieldMessage id={errorId} error={error} />
    </Stack>
  );
}

/** Props of {@link AuthNameField}. */
export interface AuthNameFieldProps extends AuthTextFieldProps {
  /** Help text: an (i) after the label shows it on hover, focus or tap */
  info?: string;
}

/**
 * Name field (`name="displayName"`, `autocomplete="name"`): the name the user wants in
 * emails. Optional, never validated: sign-up stores it trimmed as the display name
 * (metadata `full_name`) when filled, nothing when empty.
 *
 * @param props - AuthNameFieldProps
 * @returns The field
 */
export function AuthNameField({
  label,
  placeholder,
  defaultValue,
  info,
}: AuthNameFieldProps) {
  const { t } = useTranslation('auth');
  const flow = useFlow();
  return (
    <Input
      name={AUTH_FIELD.DISPLAY_NAME}
      type="text"
      autoComplete="name"
      label={label ?? t('name')}
      placeholder={placeholder}
      defaultValue={defaultValue}
      info={info}
      readOnly={flow.busy}
      className="dndev-w-full"
    />
  );
}

/** Translated names of the password show / hide toggle. */
function usePasswordRevealLabels(): { show: string; hide: string } {
  const { t } = useTranslation('auth');
  return {
    show: t('passwordToggle.show'),
    hide: t('passwordToggle.hide'),
  };
}

/**
 * Password field. Sign-in: `current-password`. Sign-up: `new-password` and a strength
 * meter, with the policy requirements unless the flow's `passwordComposition` is
 * `false`. The meter's slot is always mounted (idle until the first keystroke), so
 * typing never shifts the layout. It also reports each change to
 * `flow.watchPassword`, which runs the breached-password pre-check.
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
  const revealLabels = usePasswordRevealLabels();
  return (
    <Stack gap="tight">
      <PasswordInput
        id={inputId}
        name={AUTH_FIELD.PASSWORD}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        revealAriaLabel={revealLabels}
        label={label ?? t('password')}
        placeholder={placeholder ?? t('passwordPlaceholder')}
        onInput={
          isNew
            ? (e) => {
                const value = (e.target as HTMLInputElement).value;
                setTyped(value);
                flow.watchPassword?.(value);
              }
            : undefined
        }
        readOnly={flow.busy}
        {...fieldMessageAria({ id: errorId, error })}
        data-variant={error ? 'destructive' : undefined}
        className="dndev-w-full"
      />
      <FieldMessage id={errorId} error={error} />
      {isNew && (
        <PasswordStrengthIndicator
          password={typed}
          minLength={flow.passwordMinLength}
          showRequirements={flow.passwordComposition !== false}
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
  const revealLabels = usePasswordRevealLabels();
  return (
    <Stack gap="tight">
      <PasswordInput
        id={inputId}
        name={AUTH_FIELD.CONFIRM_PASSWORD}
        autoComplete="new-password"
        revealAriaLabel={revealLabels}
        label={label ?? t('confirmPassword')}
        placeholder={placeholder ?? t('confirmPasswordPlaceholder')}
        readOnly={flow.busy}
        {...fieldMessageAria({ id: errorId, error })}
        data-variant={error ? 'destructive' : undefined}
        className="dndev-w-full"
      />
      <FieldMessage id={errorId} error={error} />
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
      label={label ?? t('rememberMe')}
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
          {...fieldMessageAria({ id: errorId, error })}
        />
        <Label htmlFor={id}>
          <Text as="span" level="caption">
            {t('terms.accept_prefix')}{' '}
            {tosDoc !== false && (
              <LegalLink label={t('terms.tos')} document={tosDoc} />
            )}
            {tosDoc !== false && privacyDoc !== false && (
              <> {t('terms.and')} </>
            )}
            {privacyDoc !== false && (
              <LegalLink label={t('terms.privacy')} document={privacyDoc} />
            )}
          </Text>
        </Label>
      </Stack>
      <FieldMessage id={errorId} error={error} />
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
          {t('signup.resend_verification')}
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
 * Submit button: full width, loading while the flow runs (including the wait for a
 * CAPTCHA token), disabled until the provider is ready and while throttled. With the
 * env var `TURNSTILE_SITE_KEY` set, the CAPTCHA widget renders just above it (hidden
 * unless Cloudflare asks the visitor to interact); every flow call of the form takes its
 * token there.
 *
 * @param props - AuthSubmitButtonProps
 * @returns The button
 */
export function AuthSubmitButton({ children }: AuthSubmitButtonProps) {
  const { t } = useTranslation('auth');
  const flow = useFlow();
  const standard =
    flow.mode === 'signup'
      ? t('actions.sign_up_submit')
      : flow.mode === 'reset'
        ? t('forgotPassword.submit')
        : t('actions.sign_in_submit');
  return (
    <Stack gap="tight">
      <AuthCaptcha />
      <Button
        type="submit"
        variant={BUTTON_VARIANT.PRIMARY}
        fullWidth
        loading={flow.busy}
        disabled={!flow.ready || flow.blocked}
      >
        {children ?? standard}
      </Button>
    </Stack>
  );
}

/** Props of {@link AuthCodeField}. */
export interface AuthCodeFieldProps {
  /** The code step (`useEmailCodeConfirmation(...)`) */
  confirmation: EmailCodeConfirmation;
  /** Label (default: translated "Confirmation code") */
  label?: string;
}

/**
 * The sign-up code step: one box per character (`autocomplete="one-time-code"`,
 * paste of the whole code), submitted as soon as the last character is typed, the
 * error under it, "A new code has been sent." under it after a resend (no toast), and
 * a Resend button with its countdown; after a resend the code input has focus again.
 * With `TURNSTILE_SITE_KEY` set, the CAPTCHA widget renders above Resend (a resend is a
 * gated call).
 * Render it outside the
 * sign-up `AuthForm` (it is not a form field).
 *
 * @param props - AuthCodeFieldProps
 * @returns The code field
 */
export function AuthCodeField({ confirmation, label }: AuthCodeFieldProps) {
  const { t } = useTranslation('auth');
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { error, resent, resendIn } = confirmation;
  return (
    <Stack gap="tight">
      <PinInput
        ref={inputRef}
        value={confirmation.code}
        onChange={confirmation.setCode}
        onComplete={(code) => void confirmation.submit(code)}
        length={confirmation.length}
        mask={false}
        autoFocus
        label={label ?? t('codeConfirmation.label')}
        disabled={confirmation.busy || !confirmation.ready}
        digitAriaLabel={(index, length) =>
          t('codeConfirmation.digit', {
            index,
            length,
          })
        }
        {...fieldMessageAria({ id: errorId, error: error ?? undefined })}
      />
      <FieldMessage id={errorId} error={error ?? undefined} />
      {resent && (
        <Text as="span" level="caption" variant="success" role="status">
          {t('codeConfirmation.sent')}
        </Text>
      )}
      <AuthCaptcha />
      <Button
        type="button"
        variant={BUTTON_VARIANT.LINK}
        loading={confirmation.resending}
        disabled={resendIn > 0 || !confirmation.ready}
        // The click moved focus to this button: back to the code input.
        onClick={() =>
          void confirmation.resend().then(() => inputRef.current?.focus())
        }
      >
        {resendIn > 0
          ? t('codeConfirmation.resend_in', {
              seconds: resendIn,
            })
          : t('codeConfirmation.resend')}
      </Button>
    </Stack>
  );
}

/** Props of {@link AuthCodeStep}. */
export interface AuthCodeStepProps {
  /** The address the code was sent to */
  email: string;
  /**
   * Characters of the code: match the provider (Supabase: `mailer_otp_length`).
   * @default 6
   */
  length?: number;
  /** Called with the signed-in user once the code is confirmed */
  onSuccess?: (user: AuthUser) => void;
  /** Shows a "Change address" link that calls this (back to the form) */
  onChangeEmail?: () => void;
}

/**
 * The whole code step of a `confirmation: 'code'` sign-up or sign-in: "Enter the code
 * sent to {email}", the code field (auto-submit, error, inline "new code sent",
 * Resend with countdown) and, with `onChangeEmail`, a "Change address" link. No toast.
 *
 * @param props - AuthCodeStepProps
 * @returns The code step
 *
 * @example
 * ```tsx
 * <AuthCodeStep email={email} onSuccess={next} onChangeEmail={() => setEmail(null)} />
 * ```
 */
export function AuthCodeStep({
  email,
  length,
  onSuccess,
  onChangeEmail,
}: AuthCodeStepProps) {
  const { t } = useTranslation('auth');
  const confirmation = useEmailCodeConfirmation({ email, length, onSuccess });
  return (
    <Stack>
      <Text variant="muted">
        {t('codeConfirmation.intro', {
          email,
        })}
      </Text>
      <AuthCodeField confirmation={confirmation} />
      {onChangeEmail && (
        <Button
          type="button"
          variant={BUTTON_VARIANT.LINK}
          onClick={onChangeEmail}
        >
          {t('codeConfirmation.change_email')}
        </Button>
      )}
    </Stack>
  );
}
