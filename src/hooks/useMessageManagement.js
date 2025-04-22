// src/hooks/useMessageManagement.js
import { useState, useEffect, useRef, useReducer, useCallback } from 'react';
import { ethers } from 'ethers';
import { safeToNumber } from '../utils/messageHelpers';

// Constants
const SERVER_API_BASE = import.meta.env.VITE_API_URL || '';
const DEFAULT_PAGE_SIZE = 20;

// Reducer for managing message state
const messageReducer = (state, action) => {
  switch (action.type) {
    case 'LOADING_START':
      return { ...state, loading: true };
    case 'LOADING_END':
      return { ...state, loading: false };
    case 'SET_MESSAGES':
      return {
        ...state,
        messages: action.messages,
        currentPage: action.page,
        hasMorePages: action.hasMore
      };
    case 'APPEND_MESSAGES':
      return {
        ...state,
        messages: [...state.messages, ...action.messages],
        currentPage: action.page,
        hasMorePages: action.hasMore
      };
    case 'SET_HAS_MORE_PAGES':
      return { ...state, hasMorePages: action.hasMore };
    case 'DELETE_MESSAGE':
      return {
        ...state,
        messages: state.messages.filter(m =>
          safeToNumber(m.messageId) !== safeToNumber(action.messageId)
        )
      };
    case 'SET_DELETION_STATUS':
      return { ...state, deletionStatus: action.status };
    case 'SET_AUTO_REFRESH':
      return { ...state, autoRefresh: action.enabled };
    case 'SET_LAST_CHECKED':
      return { ...state, lastCheckedTimestamp: action.timestamp };
    case 'SET_NEW_MESSAGES_COUNT':
      return { ...state, newMessagesCount: action.count };
    case 'SET_LAST_KNOWN_MESSAGE_ID':
      return { ...state, lastKnownMessageId: action.id };
    case 'UPDATE_REPLY_COUNT':
      console.log(`Reducer: Updating reply count for message ${action.messageId}`);
      const newState = {
        ...state,
        messages: state.messages.map(msg => {
          if (safeToNumber(msg.messageId) === safeToNumber(action.messageId)) {
            const newReplyCount = (msg.replyCount || 0) + 1;
            console.log(`Message ${msg.messageId}: reply count ${msg.replyCount} -> ${newReplyCount}`);
            return { ...msg, replyCount: newReplyCount };
          }
          return msg;
        })
      };
      return newState;
    default:
      return state;
  }
};

const getInitialAutoRefresh = () => {
  try {
    const savedState = localStorage.getItem('autoRefresh');
    return savedState === 'true';
  } catch (e) {
    return false; // Default value if localStorage is not available
  }
};

/**
 * Hook for managing messages
 */
const useMessageManagement = (contract, provider, setMessageTimestamps, pendingMessagesState) => {
  // Private references for use within the hook
  const initialLoadCompleted = useRef(false);
  const messageIdCache = useRef(new Map());
  const messageTimestampsRef = useRef([]);

  // State for managing work with status
  const [signerError, setSignerError] = useState(false);
  const [expandedRepliesState, setExpandedRepliesState] = useState({});

  // Use useReducer for managing message state
  const [state, dispatch] = useReducer(messageReducer, {
    messages: [],
    loading: false,
    initialLoading: true,
    currentPage: 0,
    hasMorePages: true,
    deletionStatus: { pending: false, messageId: null, error: null },
    autoRefresh: getInitialAutoRefresh(),
    lastCheckedTimestamp: 0,
    newMessagesCount: 0,
    lastKnownMessageId: 0
  });

  // Extract values from state for ease of use
  const {
    messages,
    loading,
    currentPage,
    hasMorePages,
    deletionStatus,
    autoRefresh,
    lastCheckedTimestamp,
    newMessagesCount,
    lastKnownMessageId
  } = state;

  // Initialize computed state
  const initialLoading = loading && messages.length === 0;

  /**
   * Handler for invalidating server cache
   */
  const invalidateServerCache = useCallback(async () => {
    try {
      const endpoint = `${SERVER_API_BASE}/invalidate-cache`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        console.warn('Failed to invalidate server cache:', response.status);
      }
    } catch (error) {
      console.error('Error invalidating server cache:', error);
    }
  }, []);

  /**
   * Function to find real message ID
   */
  const findRealMessageId = useCallback(async (message) => {
    if (!contract) return null;

    try {
      // Create a unique key based on sender, content, and time
      const timestamp = safeToNumber(message.timestamp);
      const key = `${message.sender}-${message.content.slice(0, 20)}-${timestamp}`;

      // Check cache first
      if (messageIdCache.current.has(key)) {
        return messageIdCache.current.get(key);
      }

      // If not in cache, search in contract
      const count = await contract.getMessageCount();
      const messageCount = safeToNumber(count);

      // Search most recent messages first
      const searchLimit = Math.min(50, messageCount);

      for (let i = messageCount - 1; i > messageCount - searchLimit && i > 0; i--) {
        const candidate = await contract.getMessage(i);

        if (candidate.sender === message.sender &&
          candidate.content === message.content &&
          safeToNumber(candidate.timestamp) === timestamp) {
          // Found message, save to cache
          messageIdCache.current.set(key, i);
          return i;
        }
      }

      // Not found, use timestamp as fallback
      return timestamp;
    } catch (error) {
      console.error('Error finding message ID:', error);
      return null;
    }
  }, [contract]);

  /**
   * Load messages with pagination
   */
  const loadMessages = useCallback(async (page = 0, append = false) => {
    if (!contract) return;

    try {
      dispatch({ type: 'LOADING_START' });

      // Determine page size
      const pageSize = DEFAULT_PAGE_SIZE;

      // If loading first page and not appending to existing
      if (page === 0 && !append) {
        dispatch({ type: 'SET_NEW_MESSAGES_COUNT', count: 0 });
        dispatch({ type: 'SET_LAST_CHECKED', timestamp: Date.now() });

        // FIXED: Reset timestamp array on full refresh
        messageTimestampsRef.current = [];
      }

      // Log action for debug
      console.log(`Loading messages page ${page}, append: ${append}`);

      // Load messages from server
      const endpoint = `${SERVER_API_BASE}/api/messages/feedWithReplies/${page}/${pageSize}`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();

      // Check response structure
      if (!data || !Array.isArray(data.messages)) {
        console.error('Invalid server response format:', data);
        throw new Error('Invalid server response format');
      }

      const { messages: fetchedMessages, hasMore } = data;
      console.log(`Received ${fetchedMessages.length} messages, hasMore: ${hasMore}`);

      // Transform server response to the format expected by UI
      const formattedMessages = fetchedMessages.map(msg => ({
        messageId: safeToNumber(msg.messageId),
        displayId: msg.messageId,
        sender: msg.sender,
        nickname: msg.nickname || `${msg.sender.slice(0, 6)}...${msg.sender.slice(-4)}`,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        isReply: msg.isReply,
        replyToMessageId: safeToNumber(msg.replyToMessageId),
        originalMessage: msg.originalMessage,
        replyCount: Number(msg.replyCount || 0)
      }));

      // Update UI state depending on mode
      if (append) {
        // Filter to exclude duplicates
        const existingIds = new Set(state.messages.map(m => m.messageId));
        const uniqueNewMessages = formattedMessages.filter(m => !existingIds.has(m.messageId));

        console.log(`Adding ${uniqueNewMessages.length} unique messages to existing ${state.messages.length}`);

        if (uniqueNewMessages.length === 0) {
          console.log('No new unique messages to add');
          dispatch({ type: 'SET_HAS_MORE_PAGES', hasMore: false });
          dispatch({ type: 'LOADING_END' });
          return [];
        }

        // Dispatch action to add messages
        dispatch({
          type: 'APPEND_MESSAGES',
          messages: uniqueNewMessages,
          page,
          hasMore
        });
      } else {
        // Complete replacement of messages
        dispatch({
          type: 'SET_MESSAGES',
          messages: formattedMessages,
          page,
          hasMore
        });
      }

      // Update lastKnownMessageId
      if (formattedMessages.length > 0) {
        const maxId = Math.max(...formattedMessages.map(m => safeToNumber(m.messageId)));
        if (maxId > lastKnownMessageId) {
          dispatch({ type: 'SET_LAST_KNOWN_MESSAGE_ID', id: maxId });
        }
      }

      // FIXED: Timestamp deduplication
      // First collect unique message IDs that already exist in our storage
      const existingMessageIds = new Set();
      messageTimestampsRef.current.forEach((_, index) => {
        if (messageTimestampsRef.current[index + 1] === messageTimestampsRef.current[index]) {
          existingMessageIds.add(formattedMessages.find(
            m => m.timestamp.getTime() === messageTimestampsRef.current[index]
          )?.messageId);
        }
      });

      // Now add only timestamps of new messages
      const newTimestamps = formattedMessages
        .filter(message => !existingMessageIds.has(message.messageId))
        .map(message => message.timestamp.getTime());

      // If not append, replace all timestamps, otherwise add new ones
      if (!append && page === 0) {
        messageTimestampsRef.current = newTimestamps;
      } else {
        messageTimestampsRef.current = [...messageTimestampsRef.current, ...newTimestamps];
      }

      // Remove duplicates using Set
      messageTimestampsRef.current = [...new Set(messageTimestampsRef.current)];

      // Update timestamps in stats context
      setMessageTimestamps([...messageTimestampsRef.current]);

      return formattedMessages;
    } catch (error) {
      console.error('Error loading messages:', error);
      return [];
    } finally {
      dispatch({ type: 'LOADING_END' });
    }
  }, [contract, setMessageTimestamps, lastKnownMessageId, state.messages]);

  /**
   * Load additional messages when scrolling
   */
  const loadMoreMessages = useCallback(async () => {
    if (loading) {
      console.log('Already loading, skipping loadMoreMessages');
      return;
    }

    const nextPage = currentPage + 1;
    console.log(`Loading more messages (page ${nextPage})...`);

    try {
      dispatch({ type: 'LOADING_START' });

      // Direct API request
      const endpoint = `${SERVER_API_BASE}/api/messages/feedWithReplies/${nextPage}/${DEFAULT_PAGE_SIZE}`;
      console.log(`Fetching from: ${endpoint}`);

      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to load page ${nextPage}: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Got ${data.messages?.length || 0} messages for page ${nextPage}, hasMore: ${data.hasMore}`);

      if (!data.messages || data.messages.length === 0) {
        console.log('No more messages available');
        dispatch({ type: 'SET_HAS_MORE_PAGES', hasMore: false });
        return;
      }

      // Format messages
      const formattedMessages = data.messages.map(msg => ({
        messageId: safeToNumber(msg.messageId),
        displayId: msg.messageId,
        sender: msg.sender,
        nickname: msg.nickname || `${msg.sender.slice(0, 6)}...${msg.sender.slice(-4)}`,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        isReply: Boolean(msg.isReply),
        replyToMessageId: safeToNumber(msg.replyToMessageId),
        originalMessage: msg.originalMessage,
        replyCount: msg.replyCount || 0
      }));

      // Filter duplicates
      const existingIds = new Set(messages.map(m => m.messageId));
      const uniqueMessages = formattedMessages.filter(m => !existingIds.has(m.messageId));

      if (uniqueMessages.length === 0) {
        console.log('No new unique messages, stopping pagination');
        dispatch({ type: 'SET_HAS_MORE_PAGES', hasMore: false });
      } else {
        // Add new messages
        dispatch({
          type: 'APPEND_MESSAGES',
          messages: uniqueMessages,
          page: nextPage,
          hasMore: data.hasMore
        });

        // Update timestamps
        const timestamps = uniqueMessages.map(msg => msg.timestamp.getTime());
        messageTimestampsRef.current = [...messageTimestampsRef.current, ...timestamps];
        setMessageTimestamps([...messageTimestampsRef.current]);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
      dispatch({ type: 'SET_HAS_MORE_PAGES', hasMore: false });
    } finally {
      dispatch({ type: 'LOADING_END' });
    }
  }, [loading, currentPage, messages, messageTimestampsRef, setMessageTimestamps]);

  /**
   * Toggle auto-refresh
   */
  const toggleAutoRefresh = useCallback(() => {
    const newValue = !autoRefresh;
    // Save to localStorage
    try {
      localStorage.setItem('autoRefresh', newValue.toString());
    } catch (e) {
      console.error('Error saving autoRefresh to localStorage:', e);
    }
    dispatch({ type: 'SET_AUTO_REFRESH', enabled: newValue });
  }, [autoRefresh]);

  /**
   * Manual message refresh
   */
  const handleRefreshMessages = useCallback(() => {
    loadMessages(0, false);
  }, [loadMessages]);

  /**
   * Check for new messages
   * Fixed version - now uses useCallback
   */
  const checkForNewMessages = useCallback(async () => {
    if (!contract || loading) return;

    try {
      // Get current message count
      const count = await contract.getMessageCount();
      const currentCount = safeToNumber(count);

      // If lastKnownMessageId is 0, this is initial load
      if (lastKnownMessageId === 0) {
        dispatch({ type: 'SET_LAST_KNOWN_MESSAGE_ID', id: currentCount - 1 });
        return;
      }

      // If there are new messages
      if (currentCount - 1 > lastKnownMessageId) {
        const newCount = currentCount - 1 - lastKnownMessageId;

        if (autoRefresh) {
          // If auto-refresh is enabled, load new messages
          loadMessages(0, false);
        } else {
          // Otherwise update new message counter
          dispatch({ type: 'SET_NEW_MESSAGES_COUNT', count: newCount });
          dispatch({ type: 'SET_LAST_CHECKED', timestamp: Date.now() });
        }
      }
    } catch (error) {
      console.error('Error polling for new messages:', error);
    }
  }, [contract, loading, lastKnownMessageId, autoRefresh, loadMessages]);

  // Effect for initial message loading
  useEffect(() => {
    if (contract && !initialLoadCompleted.current) {
      initialLoadCompleted.current = true;
      loadMessages(0, false);
    }
  }, [contract, loadMessages]);

  // Export all necessary functions and states
  return {
    messages,
    loading,
    initialLoading,
    currentPage,
    hasMorePages,
    deletionStatus,
    autoRefresh,
    lastCheckedTimestamp,
    newMessagesCount,
    lastKnownMessageId,
    expandedRepliesState,
    setExpandedRepliesState,
    loadMessages,
    loadMoreMessages,
    findRealMessageId,
    handleRefreshMessages,
    toggleAutoRefresh,
    checkForNewMessages,
    invalidateServerCache,
    messageIdCache,
    initialLoadCompleted,
    messageTimestampsRef,
    dispatch,
    signerError,
    setSignerError
  };
};

export default useMessageManagement;