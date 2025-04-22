// src/hooks/useMessagePolling.js
import { useEffect, useRef, useCallback } from 'react';
import { safeToNumber } from '../utils/messageHelpers';

// Constants
const POLLING_INTERVAL = 15000;
const AUTO_REFRESH_INTERVAL = 30000;

/**
 * Hook for setting up message polling and auto-refresh
 * @param {Object} options - Polling options
 * @returns {Object} Polling references and check methods
 */
export const useMessagePolling = ({
  contract,
  autoRefresh,
  loadMessages,
  dispatch,
  lastCheckedActiveCountRef = { current: 0 }
}) => {
  // References for intervals
  const pollingIntervalRef = useRef(null);
  const autoRefreshIntervalRef = useRef(null);
  
  // Check for new messages without updating UI
  const checkForNewMessages = useCallback(async () => {
    if (!contract) return;

    try {
      // Get active message count
      const activeMessageCount = await contract.getTotalActiveMessages();
      const currentActiveCount = safeToNumber(activeMessageCount);

      // Initialize on first check
      if (!lastCheckedActiveCountRef.current) {
        lastCheckedActiveCountRef.current = currentActiveCount;
        return;
      }

      // Compare with previous value
      if (currentActiveCount > lastCheckedActiveCountRef.current) {
        const newCount = currentActiveCount - lastCheckedActiveCountRef.current;
        console.log(`New active messages detected: ${newCount}`);
        dispatch({ type: 'SET_NEW_MESSAGES_COUNT', count: newCount });
      }

      lastCheckedActiveCountRef.current = currentActiveCount;
      dispatch({ type: 'SET_LAST_CHECKED_TIMESTAMP', timestamp: Date.now() });
    } catch (error) {
      console.error('Error polling for new messages:', error);
    }
  }, [contract, dispatch, lastCheckedActiveCountRef]);

  // Setup polling interval
  useEffect(() => {
    pollingIntervalRef.current = setInterval(checkForNewMessages, POLLING_INTERVAL);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [checkForNewMessages]);

  // Setup auto-refresh interval
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshIntervalRef.current = setInterval(() => {
        console.log('Auto-refreshing messages...');
        loadMessages(0, false);
      }, AUTO_REFRESH_INTERVAL);
    }

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [autoRefresh, loadMessages]);

  return {
    pollingIntervalRef,
    autoRefreshIntervalRef,
    checkForNewMessages
  };
};

export default useMessagePolling;