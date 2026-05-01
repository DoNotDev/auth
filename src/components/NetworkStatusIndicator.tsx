'use client';
// packages/features/auth/src/components/NetworkStatusIndicator.tsx

/**
 * @fileoverview NetworkStatusIndicator component
 * @description Component to show network status with reconnection guidance
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Alert, Button, BUTTON_VARIANT, Stack } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

import { useNetworkStatus } from '../hooks/useNetworkStatus';

import type { NetworkStatusIndicatorProps } from '../constants';

/**
 * Component to show network status with reconnection guidance
 * Displays an alert when the user is offline or optionally when online
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * @param {NetworkStatusIndicatorProps} props - Component props
 * @returns {JSX.Element} NetworkStatusIndicator component
 */
function NetworkStatusIndicator({
  showWhenOnline = false,
  className = '',
}: NetworkStatusIndicatorProps) {
  const { t } = useTranslation('auth');
  const { online, connectionType, isSlowConnection } = useNetworkStatus();

  // Don't show when online unless explicitly asked
  if (online && !showWhenOnline) {
    return null;
  }

  return (
    <Alert
      variant={online ? undefined : 'error'}
      className={className}
      role="status"
      aria-live={online ? 'polite' : 'assertive'}
      title={
        online
          ? t('networkStatus.online', { defaultValue: 'You are online' })
          : t('networkStatus.offline', { defaultValue: 'You are offline' })
      }
      description={
        online ? (
          <span>
            {t('networkStatus.connectedVia', {
              connectionType: connectionType || 'unknown',
              defaultValue: `Connected via ${connectionType || 'unknown'}`,
            })}
          </span>
        ) : (
          <Stack>
            <p>
              {t('networkStatus.offlineMessage', {
                defaultValue:
                  'Authentication requires an internet connection. Please check your network settings.',
              })}
            </p>
            <Button
              variant={BUTTON_VARIANT.GHOST}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              style={{
                fontSize: 'var(--font-size-sm)',
                textDecoration: 'underline',
                fontWeight: 500,
              }}
            >
              {t('networkStatus.checkAgain', { defaultValue: 'Check again' })}
            </Button>
          </Stack>
        )
      }
    />
  );
}

// Set display name for debugging

// Export as default
export default NetworkStatusIndicator;
