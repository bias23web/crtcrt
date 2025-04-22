// src/hooks/usePendingMessages.js
import { useState, useCallback, useEffect } from 'react';

/**
 * Hook for tracking and managing pending messages
 * @returns {Object} Pending messages state and functions
 */
export const usePendingMessages = () => {
  const [pendingMessages, setPendingMessages] = useState([]);
  
  /**
   * Add a new pending message to track
   * @param {string} content - Message content
   * @param {string} txHash - Transaction hash
   * @param {boolean} isReply - Whether this is a reply
   * @param {number|null} replyToId - ID of message being replied to
   * @param {string} sender - Message sender address
   * @param {string} nickname - Sender's nickname
   * @returns {string} Temporary ID for the message
   */
  const trackPendingMessage = useCallback((content, txHash, isReply = false, replyToId = null, sender, nickname) => {
    const pendingMessage = {
      id: `temp-${Date.now()}`, // Temporary ID
      content,
      sender,
      nickname: nickname || `${sender.slice(0, 6)}...${sender.slice(-4)}`,
      timestamp: Date.now(),
      transactionHash: txHash,
      isReply,
      replyToMessageId: replyToId,
      resolved: false,
      resolvedId: null
    };

    setPendingMessages(prev => [...prev, pendingMessage]);
    console.log('Tracking new pending message:', pendingMessage);

    return pendingMessage.id;
  }, []);

  /**
   * Update an existing pending message
   * @param {string} tempId - Temporary ID of the message
   * @param {Object} updates - Updates to apply
   */
  const updatePendingMessage = useCallback((tempId, updates) => {
    setPendingMessages(prev =>
      prev.map(msg =>
        msg.id === tempId ? { ...msg, ...updates } : msg
      )
    );
  }, []);

  /**
   * Remove resolved messages older than 5 minutes
   */
  const cleanupResolvedMessages = useCallback(() => {
    // Remove messages resolved more than 5 minutes ago
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    setPendingMessages(prev =>
      prev.filter(msg =>
        !msg.resolved || !msg.resolvedTimestamp || msg.resolvedTimestamp > fiveMinutesAgo
      )
    );
  }, []);

  // Cleanup resolved messages periodically
  useEffect(() => {
    const interval = setInterval(cleanupResolvedMessages, 60000); // Every minute
    return () => clearInterval(interval);
  }, [cleanupResolvedMessages]);

  return {
    pendingMessages,
    trackPendingMessage,
    updatePendingMessage,
    cleanupResolvedMessages
  };
};

export default usePendingMessages;