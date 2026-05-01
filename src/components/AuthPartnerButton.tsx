'use client';
// packages/features/auth/src/components/AuthPartnerButton.tsx

/**
 * @fileoverview AuthPartnerButton component
 * @description Button component for authentication with various partners and methods
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useMemo, useState } from 'react';

// Custom hover style for partner buttons
if (
  typeof document !== 'undefined' &&
  !document.getElementById('auth-partner-button-styles')
) {
  const style = document.createElement('style');
  style.id = 'auth-partner-button-styles';
  style.textContent = `
.dndev-interactive.auth-partner-button-custom[data-variant='outline']:hover {
  background-color: var(--partner-hover-bg);
 }
 `;
  document.head.appendChild(style);
}

import {
  cn,
  DISPLAY,
  PROVIDER_ICONS,
  DefaultProviderIcon,
  Button,
  BUTTON_VARIANT,
  Spinner,
} from '@donotdev/components';
import { AUTH_PARTNERS, useTranslation } from '@donotdev/core';

import { EmailLinkForm } from './EmailLinkForm';
import EmailPasswordForm from './EmailPasswordForm';
import {
  getAuthMethod,
  type AuthMethod,
  type AuthPartnerButtonProps,
} from '../constants';
import { useAuth } from '../useAuth';

import type { ButtonHTMLAttributes, CSSProperties } from 'react';

interface AuthPartnerButtonComponentProps extends AuthPartnerButtonProps {
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
}

/**
 * AuthPartnerButton - Authentication button component
 *
 * Provides a unified button interface for authentication with various partners
 * (Google, Facebook, etc.) and methods (OAuth, email/password, email link).
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
function AuthPartnerButton({
  partnerId,
  method,
  onSuccess,
  onError,
  className = '',
  children,
  disabled = false,
  display = DISPLAY.AUTO,
  style,
  ...props
}: AuthPartnerButtonComponentProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onError' | 'onSuccess'>) {
  const { t } = useTranslation('auth');
  const user = useAuth('user');
  const signInWithPartner = useAuth('signInWithPartner');
  const linkWithPartner = useAuth('linkWithPartner');
  const isAvailable = useAuth('isAvailable');

  // Local loading state (component-level, not hook-level)
  const [isLoading, setIsLoading] = useState(false);

  const partnerConfig = useMemo(() => AUTH_PARTNERS[partnerId], [partnerId]);

  // Email partners render forms inline
  if (partnerId === 'password') {
    return (
      <div className={className}>
        <EmailPasswordForm
          mode="signin"
          onSuccess={() => onSuccess?.(null)}
          onError={onError}
          compact={true}
        />
      </div>
    );
  }

  if (partnerId === 'emailLink') {
    return (
      <div className={className}>
        <EmailLinkForm onSuccess={() => onSuccess?.(null)} onError={onError} />
      </div>
    );
  }

  const ProviderIcon = useMemo(
    () => PROVIDER_ICONS[partnerId] || DefaultProviderIcon,
    [partnerId]
  );

  // Check if already linked (map partnerId to Firebase providerId for comparison)
  const firebaseProviderId = partnerConfig?.firebaseProviderId;
  const isLinked = Boolean(
    user?.providerData?.some(
      (provider: { providerId: string }) =>
        provider.providerId === firebaseProviderId
    )
  );

  const shouldLink = user && !isLinked;

  /**
   * Handle click - let parent handle errors
   */
  const handleClick = async () => {
    if (isLoading || disabled) return;

    setIsLoading(true);

    try {
      let result;

      if (shouldLink) {
        // Link account - respect method prop, fallback to getAuthMethod (popup in dev, redirect in prod)
        result = await linkWithPartner(partnerId, getAuthMethod(method));
      } else {
        // Sign in - respect method prop, fallback to getAuthMethod (popup in dev, redirect in prod)
        const authMethod = getAuthMethod(method);
        result = await signInWithPartner(partnerId, authMethod);
      }

      if (result) {
        // Success (non-null result means completed, not redirect)
        onSuccess?.(result);
      }
      // null result means redirect initiated or user cancelled - don't show anything
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsLoading(false);
    }
  };

  const partnerName = partnerConfig?.name;

  const getButtonText = () => {
    if (children) return children;

    if (shouldLink) {
      if (isLoading) return t('buttons.linking', { partner: partnerName });
      if (isLinked) return t('buttons.linked', { partner: partnerName });
      return t('buttons.link', { partner: partnerName });
    }

    if (isLoading) return t('buttons.signingIn', { partner: partnerName });

    const textKey = partnerConfig?.button?.textKey;
    return textKey ? t(textKey) : `Sign in with ${partnerName}`;
  };

  const isDisabled =
    disabled || isLoading || !isAvailable || (shouldLink && isLinked) || false;

  const buttonStyle = partnerConfig?.button
    ? ({
        backgroundColor: partnerConfig.button.backgroundColor,
        color: partnerConfig.button.textColor,
        borderColor: partnerConfig.button.borderColor,
        '--partner-hover-bg': partnerConfig.button.hoverBackgroundColor,
      } as CSSProperties & { '--partner-hover-bg': string })
    : undefined;

  // Merge passed style with partner button style (passed style takes precedence)
  const mergedStyle = style ? { ...buttonStyle, ...style } : buttonStyle;

  return (
    <Button
      variant={BUTTON_VARIANT.OUTLINE}
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={isLoading}
      display={display}
      aria-label={
        isLoading
          ? `Signing in with ${partnerName}...`
          : `Sign in with ${partnerName}`
      }
      tooltip={undefined}
      style={mergedStyle}
      className={cn(
        partnerConfig?.button && 'auth-partner-button-custom',
        className
      )}
      icon={isLoading ? <Spinner aria-label="Loading" /> : ProviderIcon}
    >
      {display !== DISPLAY.COMPACT && getButtonText()}
    </Button>
  );
}

export default AuthPartnerButton;
