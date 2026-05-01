'use client';
// packages/features/auth/src/hooks/useFedCM.ts

/**
 * @fileoverview useFedCM Hook - October 2025 Detection Only
 *
 * @description
 * Simplified FedCM support detection hook. As of October 2024, FedCM is mandatory
 * for Google One Tap - no longer optional. This hook only detects browser support.
 *
 * **Key Changes from Previous Version:**
 * - Removed enable/disable toggle (FedCM is now mandatory)
 * - Simplified to detection-only
 * - Removed storage persistence (not needed for mandatory feature)
 *
 * **Browser Support:**
 * - Chrome 116+ (stable)
 * - Edge 116+ (stable)
 * - Safari: Not yet supported (users need Chrome/Edge)
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useEffect, useMemo, useRef } from 'react';

import { handleError, isClient } from '@donotdev/core';

/**
 * FedCM hook options
 */
interface UseFedCMOptions {
  /**
   * Whether to check Google services availability
   * @default true
   */
  checkGoogleServices?: boolean;

  /**
   * Error callback for detection failures
   */
  onError?: (error: Error) => void;
}

/**
 * FedCM hook return type
 */
interface UseFedCMReturn {
  /** Whether FedCM is supported in this browser */
  isSupported: boolean;

  /** Whether FedCM check is complete */
  isReady: boolean;

  /** Any error during FedCM detection */
  error: Error | null;

  /** Browser name for user messaging */
  browserInfo: {
    name: string;
    isSupported: boolean;
    recommendation: string;
  };
}

/**
 * Detect FedCM browser support
 *
 * @description
 * As of October 2024, FedCM is mandatory for Google One Tap.
 * This hook detects if the browser supports the IdentityCredential API.
 *
 * **Usage:**
 * ```tsx
 * const { isSupported, isReady, browserInfo } = useFedCM();
 *
 * if (!isSupported && isReady) {
 *   return <Alert>Please use Chrome 116+ or Edge 116+ for Google Sign-In</Alert>;
 * }
 * ```
 *
 * @param options - Hook configuration options
 * @returns FedCM support information
 */
export function useFedCM({
  checkGoogleServices = true,
  onError,
}: UseFedCMOptions = {}): UseFedCMReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stabilize onError callback to prevent effect re-runs with inline callbacks
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Detect FedCM support on mount
  useEffect(() => {
    if (!isClient()) return;

    const detectSupport = async () => {
      try {
        // Check if IdentityCredential exists
        const hasIdentityCredential = 'IdentityCredential' in window;

        // Optional: Check if Google One Tap is available
        let googleServicesAvailable = true;
        if (checkGoogleServices) {
          // Wait for Google script to load (with timeout)
          const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
          await Promise.race([
            new Promise((resolve) => {
              const check = setInterval(() => {
                if (window.google?.accounts?.id) {
                  clearInterval(check);
                  resolve(true);
                }
              }, 100);
            }),
            timeout,
          ]);

          googleServicesAvailable = !!window.google?.accounts?.id;
        }

        const supported = hasIdentityCredential && googleServicesAvailable;
        setIsSupported(supported);
        setIsReady(true);

        // No logging when unsupported
      } catch (err) {
        const detectionError = handleError(err, {
          userMessage: 'Failed to detect FedCM support',
          context: { operation: 'fedcm_detection' },
          severity: 'warning',
        });

        setError(detectionError);
        setIsReady(true);
        onErrorRef.current?.(detectionError);
      }
    };

    detectSupport();
  }, [checkGoogleServices]);

  // Browser information for user messaging
  const browserInfo = useMemo(() => {
    if (!isClient()) {
      return {
        name: 'Unknown',
        isSupported: false,
        recommendation: 'Loading...',
      };
    }

    const ua = navigator.userAgent;
    let name = 'Unknown';
    let recommendation = 'Please update your browser';

    if (ua.includes('Chrome/')) {
      const version = parseInt(ua.match(/Chrome\/(\d+)/)?.[1] || '0');
      name = `Chrome ${version}`;
      recommendation =
        version >= 116 ? 'Supported' : 'Please update to Chrome 116 or later';
    } else if (ua.includes('Edg/')) {
      const version = parseInt(ua.match(/Edg\/(\d+)/)?.[1] || '0');
      name = `Edge ${version}`;
      recommendation =
        version >= 116 ? 'Supported' : 'Please update to Edge 116 or later';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      name = 'Safari';
      recommendation = 'Not supported yet. Please use Chrome or Edge';
    } else if (ua.includes('Firefox/')) {
      name = 'Firefox';
      recommendation = 'Not supported yet. Please use Chrome or Edge';
    }

    return {
      name,
      isSupported,
      recommendation,
    };
  }, [isSupported]);

  return {
    isSupported,
    isReady,
    error,
    browserInfo,
  };
}
