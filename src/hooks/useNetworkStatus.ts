'use client';
// packages/features/auth/src/hooks/useNetworkStatus.ts

/**
 * @fileoverview useNetworkStatus Hook
 * @description Custom hook for network status detection and connection monitoring
 *
 * **Features:**
 * - Online/offline detection
 * - Connection type detection (slow/fast)
 * - SSR-safe initialization
 * - Automatic cleanup
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useEffect } from 'react';

import { isClient } from '@donotdev/core';

interface UseNetworkStatusReturn {
  online: boolean;
  connectionType: string;
  isSlowConnection: boolean;
  isOnline: boolean;
  isOffline: boolean;
}

/**
 * Custom hook for network status monitoring
 *
 * **SSR Safe:** Returns safe defaults on server
 * **CSR Safe:** Monitors real network status on client
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 * **Usage:**
 * ```tsx
 * function MyComponent() {
 *   const { online, isSlowConnection, connectionType } = useNetworkStatus();
 *
 *   if (!online) {
 *     return <OfflineMessage />;
 *   }
 *
 *   return <Content />;
 * }
 * ```
 */
export function useNetworkStatus(): UseNetworkStatusReturn {
  // SSR-safe initial state
  const [online, setOnline] = useState(() => {
    if (!isClient()) return true;
    return navigator.onLine;
  });

  const [connectionType, setConnectionType] = useState<string>('unknown');

  useEffect(() => {
    // Skip if not in browser
    if (!isClient()) return;

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    // Check connection type
    const checkConnectionType = () => {
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        setConnectionType(connection.effectiveType || 'unknown');
      }
    };

    // Set up event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    checkConnectionType();

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Computed values
  const isSlowConnection =
    connectionType === 'slow-2g' || connectionType === '2g';
  const isOnline = online;
  const isOffline = !online;

  return {
    online,
    connectionType,
    isSlowConnection,
    isOnline,
    isOffline,
  };
}
