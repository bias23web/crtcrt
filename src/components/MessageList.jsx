// src/components/MessageList.jsx
import React, { useState, useEffect, useMemo } from 'react';
import Avatar from './Avatar';
import { ethers } from 'ethers';
import MessageForm from './MessageForm';
import { useWeb3 } from '../contexts/Web3Context';

const MessageList = React.memo(function MessageList({
  messages,
  currentUser,
  onDelete,
  onReply,
  pendingDeletion,
  onScrollToMessage,
  initialExpandedReplies = {}
}) {
  const { contract, fetchUserProfile, profileCache } = useWeb3();
  const [expandedReplies, setExpandedReplies] = useState(initialExpandedReplies);
  const [expandedReplyForms, setExpandedReplyForms] = useState({});
  const [loadedReplies, setLoadedReplies] = useState({});
  const [loadingReplies, setLoadingReplies] = useState({});
  const [replyErrors, setReplyErrors] = useState({});
  const [columnCount, setColumnCount] = useState(3);

  // Update column count based on screen size
  useEffect(() => {
    const updateColumnCount = () => {
      if (window.innerWidth < 1024) {
        setColumnCount(1);
      } else if (window.innerWidth < 1400) {
        setColumnCount(2);
      } else if (window.innerWidth < 1920) {
        setColumnCount(3);
      } else if (window.innerWidth < 2400) {
        setColumnCount(4);
      } else if (window.innerWidth < 2800) {
        setColumnCount(5);
      } else if (window.innerWidth < 3200) {
        setColumnCount(6);
      } else if (window.innerWidth < 3600) {
        setColumnCount(7);
      } else {
        setColumnCount(8);
      }
    };

    // Set initial column count
    updateColumnCount();

    // Update on resize
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);

  // Load profiles for all message senders
  useEffect(() => {
    const loadSendersProfiles = async () => {
      if (messages && messages.length > 0) {
        // Collect unique sender addresses
        const uniqueSenders = [...new Set(messages.map(msg => msg.sender))];

        // Load profiles for each sender
        await Promise.all(
          uniqueSenders.map(sender => fetchUserProfile(sender))
        );
      }
    };

    loadSendersProfiles();
  }, [messages, fetchUserProfile]);

  const formatRelativeTime = (date) => {
    if (!date) return '';

    const now = new Date();
    const diff = now - date;

    // Convert time difference to seconds
    const seconds = Math.floor(diff / 1000);

    // Time intervals in seconds
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
      second: 1
    };

    // Find the appropriate interval
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);

      if (interval >= 1) {
        return interval === 1
          ? `1 ${unit} ago`
          : `${interval} ${unit}s ago`;
      }
    }

    return 'just now';
  };

  // Helper function to safely convert numbers
  const safeToNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (value && typeof value.toNumber === 'function') {
      try {
        return value.toNumber();
      } catch (e) {
        return Number(value.toString());
      }
    }
    return Number(value);
  };

  // Filter and sort messages - all messages including replies
  const sortedMessages = useMemo(() => {
    console.log('Processing messages data:', messages.length, 'total messages');

    const filtered = [...messages]
      .filter(message => {
        // Basic checks
        if (!message || !message.sender) return false;
        if (message.sender === ethers.constants.AddressZero) return false;
        if (message.isDeleted) return false;

        // For temporary messages (being processed) special logic
        if (message.messageId === 0 || message.messageId === '0' ||
          (message.displayId && message.displayId === 'Pending')) {
          // Only the author can see their temporary messages
          return message.sender.toLowerCase() === currentUser?.toLowerCase();
        }

        // Show all other messages to everyone
        return true;
      })
      .sort((a, b) => {
        // Sort by time (newest first)
        if (a.timestamp && b.timestamp) {
          return new Date(b.timestamp) - new Date(a.timestamp);
        }
        // Sort by ID if times are the same
        return safeToNumber(b.messageId) - safeToNumber(a.messageId);
      });

    console.log(`Filtered to ${filtered.length} messages`);
    return filtered;
  }, [messages, currentUser]);

  const messageColumns = useMemo(() => {
    const columns = Array.from({ length: columnCount }, () => []);

    sortedMessages.forEach((message, index) => {
      const columnIndex = index % columnCount;
      columns[columnIndex].push(message);
    });

    return columns;
  }, [sortedMessages, columnCount]);

  // Function to load replies when expanding a message
  const loadRepliesIfNeeded = async (messageId, forceRefresh = false) => {
    // If forced refresh required or no data in cache yet
    if (forceRefresh || !loadedReplies[messageId] || loadingReplies[messageId]) {
      try {
        setLoadingReplies(prev => ({ ...prev, [messageId]: true }));
        setReplyErrors(prev => ({ ...prev, [messageId]: null }));

        console.log(`Loading replies for message ${messageId}${forceRefresh ? ' (forced refresh)' : ''}`);

        try {
          // Add nocache parameter to prevent browser caching
          const response = await fetch(`/api/messages/${messageId}/replies?t=${Date.now()}`);

          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }

          const replies = await response.json();
          console.log(`Received ${replies.length} replies for message ${messageId}`);

          setLoadedReplies(prev => ({ ...prev, [messageId]: replies }));
        } catch (error) {
          console.error(`Error loading replies for message ${messageId}:`, error);
          setReplyErrors(prev => ({ ...prev, [messageId]: `Error: ${error.message}` }));
          setLoadedReplies(prev => ({ ...prev, [messageId]: [] }));
        }
      } catch (error) {
        console.error('Unexpected error in loadRepliesIfNeeded:', error);
      } finally {
        setLoadingReplies(prev => ({ ...prev, [messageId]: false }));
      }
    }
  };

  // Toggle reply form visibility
  const toggleReplyForm = (messageId) => {
    setExpandedReplyForms(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  // Toggle replies visibility
  const toggleReplies = async (messageId) => {
    // If already expanded, just collapse
    if (expandedReplies[messageId]) {
      setExpandedReplies(prev => ({
        ...prev,
        [messageId]: false
      }));
      return;
    }
  
    // Always force refresh when opening thread
    await loadRepliesIfNeeded(messageId, true);
  
    // Expand replies
    setExpandedReplies(prev => ({
      ...prev,
      [messageId]: true
    }));
  };

  // Handle delete button click
  const handleDelete = (messageId) => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      onDelete(messageId);
    }
  };

  const toggleRepliesAndForm = async (messageId) => {
    // If user is not authenticated, only load replies
    if (!currentUser) {
      if (!expandedReplies[messageId]) {
        // Always force refresh when opening thread
        await loadRepliesIfNeeded(messageId, true);
        setExpandedReplies(prev => ({
          ...prev,
          [messageId]: true
        }));
      } else {
        setExpandedReplies(prev => ({
          ...prev,
          [messageId]: false
        }));
      }
      return;
    }
  
    // For authenticated users - full functionality
    // Always force refresh when opening thread
    await loadRepliesIfNeeded(messageId, true);
  
    if (expandedReplies[messageId] && expandedReplyForms[messageId]) {
      setExpandedReplies(prev => ({
        ...prev,
        [messageId]: false
      }));
      setExpandedReplyForms(prev => ({
        ...prev,
        [messageId]: false
      }));
    } else {
      setExpandedReplies(prev => ({
        ...prev,
        [messageId]: true
      }));
      setExpandedReplyForms(prev => ({
        ...prev,
        [messageId]: true
      }));
    }
  };

  // Handle reply form submission
  const handleReply = (messageId, content) => {
    onReply(messageId, content);
    // Close reply form after sending
    setExpandedReplyForms(prev => ({
      ...prev,
      [messageId]: false
    }));
  };

  // Render a single message card
  const renderMessage = (message) => {
    // Check message ID
    const messageId = message.messageId;
    const isProcessing = messageId === 0 || messageId === '0' || message.displayId === 'Pending';

    // Base classes for all messages
    const baseClasses = `relative h-fit p-4 inset-ring rounded-xl inset-ring-white/10 mb-4 break-inside-avoid-column overflow-hidden 
    ${message.sender === currentUser ? 'bg-gray-900' : 'bg-gray-950'}
    ${pendingDeletion === messageId ? 'opacity-50' : ''} 
    ${message.isReply ? 'border-l-2 border-sky-700/0' : ''}
    ${!currentUser ? 'pb-4' : ''}`;

    // Add visual distinction for temporary messages
    const processingClasses = isProcessing ? 'border-l-2 border-sky-400 animate-pulse' : '';

    return (
      <div
        key={`msg-${isProcessing ? `temp-${message.tempId || Date.now()}` : messageId}`}
        id={`message-${isProcessing ? `temp-${message.tempId || Date.now()}` : messageId}`}
        data-original-id={message.originalId || ''}
        data-timestamp={message.timestamp}
        className={`${baseClasses} ${processingClasses}`}
      >
        <div className="flex gap-4">
          <div className="w-9 h-9 bg-gray-800 rounded-md shrink-0">
            <Avatar
              address={message.sender}
              avatarCode={profileCache[message.sender]?.avatarCode}
              isLoading={profileCache[message.sender]?.loading}
            />
          </div>
          <div className="flex flex-col w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span
                  className="message-author mr-4 font-bold font-mono text-sm"
                  title={`${message.sender.slice(0, 6)}...${message.sender.slice(-4)}`}
                >
                  @{message.nickname || `${message.sender.slice(0, 6)}...${message.sender.slice(-4)}`}
                </span>
              </div>
            </div>
            <div className='flex flex-row text-xs gap-2'>
              <span
                className="message-time text-gray-400 cursor-help"
                title={new Date(message.timestamp).toLocaleString()}
              >
                {formatRelativeTime(new Date(message.timestamp))}
              </span>
              <span className="text-gray-600">|</span>
              <div className="text-gray-400">
                {isProcessing ? (
                  <span className="animate-pulse">Processing...</span>
                ) : (
                  `ID: ${message.displayId || message.messageId}`
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Show info if this is a reply */}
        {message.isReply && message.replyToMessageId > 0 && (
          <div className="reply-info bg-gray-800/50 rounded px-2 py-1 text-xs font-mono text-gray-400 mt-2">
            Replying to {onScrollToMessage ? (
              <button
                onClick={() => onScrollToMessage && onScrollToMessage(message.replyToMessageId)}
                className="ml-1 text-sky-300 hover:text-sky-200 cursor-pointer"
              >{message.originalMessage ? `@${message.originalMessage.nickname}` : `@user`}</button>
            ) : (
              <span className="ml-1 text-sky-300">{message.originalMessage ? `@${message.originalMessage.nickname}` : `@user`}</span>
            )}
          </div>
        )}

        <div className="message-text font-mono whitespace-pre pt-4 text-xs" >
          {message.content}
        </div>

        {(currentUser || (message.replyCount > 0)) && (
          <div className='py-2 border-white/10 border-b-1'></div>
        )}

        {/* Message actions */}
        {(currentUser || message.replyCount > 0) && !isProcessing && (
          <div className="message-actions flex mt-2 text-xs font-mono">
            {!message.isReply && (
              <button
                onClick={() => toggleRepliesAndForm(messageId)}
                className="text-sky-300 hover:text-sky-200 mr-3"
              >
                [ {expandedReplies[messageId] ? 'Hide Replies' :
                  loadedReplies[messageId]?.length > 0
                    ? `Replies (${loadedReplies[messageId].length})`
                    : message.replyCount > 0
                      ? `Replies (${message.replyCount})`
                      : currentUser ? 'Reply' : 'View Replies'} ]
              </button>
            )}

            {message.sender === currentUser && (
              <button
                onClick={() => handleDelete(messageId)}
                className="text-red-500 hover:text-red-400 ml-auto"
              >
                [ Delete ]
              </button>
            )}
          </div>
        )}

        {/* Reply form - only for messages with normal ID */}
        {expandedReplyForms[messageId] && currentUser && !isProcessing && (
          <div className="mt-3 rounded">
            <MessageForm
              onSendMessage={(content) => handleReply(messageId, content)}
              disabled={!currentUser}
              placeholder="Type your reply..."
              buttonText="Post Reply"
              isReply={true}
            />
          </div>
        )}

        {/* Replies section - only for main messages with valid IDs */}
        {!message.isReply && expandedReplies[messageId] && !isProcessing && (
          <div className="mt-3 rounded">
            {loadingReplies[messageId] ? (
              <div className="text-xs font-mono text-center p-2">Loading replies...</div>
            ) : replyErrors[messageId] ? (
              <div className="text-xs font-mono text-red-400 text-center p-2">
                {replyErrors[messageId]}
              </div>
            ) : loadedReplies[messageId]?.length > 0 ? (
              <div className="space-y-2">
                {loadedReplies[messageId].map((reply) => (
                  <div key={`reply-${reply.messageId}`} className="p-2 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-gray-800 rounded-md shrink-0 mr-2">
                          <Avatar
                            address={reply.sender}
                            avatarCode={profileCache[reply.sender]?.avatarCode}
                            size="small"
                          />
                        </div>
                        <span className="font-mono text-xs font-bold">
                          @{reply.nickname}
                        </span>
                        <span
                          className="text-gray-400 text-xs ml-2 cursor-help"
                          title={new Date(reply.timestamp).toLocaleString()}
                        >
                          {formatRelativeTime(new Date(reply.timestamp))}
                        </span>
                      </div>
                    </div>
                    <p className="font-mono text-xs whitespace-pre-wrap">
                      {reply.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs font-mono text-center p-2">No replies yet</div>
            )}
          </div>
        )}

        {/* Processing indicator for new messages */}
        {isProcessing && (
          <div className="message-actions flex mt-2 text-xs font-mono">
            <span className="text-sky-300">[ Processing Transaction... ]</span>
          </div>
        )}
      </div>
    );
  };

  // If no messages, show empty state
  if (sortedMessages.length === 0) {
    return <div className="no-messages font-mono text-center p-4">No messages found</div>;
  }

  // Render the masonry grid with columns
  return (
    <div className="masonry-grid grid gap-4 w-fit mx-auto px-4" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
      {messageColumns.map((column, columnIndex) => (
        <div key={`column-${columnIndex}`} className="masonry-column flex flex-col">
          {column.map(message => renderMessage(message))}
        </div>
      ))}
    </div>
  );
}, (prevProps, nextProps) => {
  // Optimization: only re-render if something important changed
  if (prevProps.messages.length !== nextProps.messages.length ||
    prevProps.currentUser !== nextProps.currentUser ||
    prevProps.pendingDeletion !== nextProps.pendingDeletion) {
    return false;
  }

  // More precise comparison for messages
  const prevIds = new Set();
  const nextIds = new Set();

  prevProps.messages.forEach(msg => {
    const id = msg.messageId === 0 ? `temp-${msg.tempId || msg.timestamp.getTime()}` : msg.messageId;
    prevIds.add(id);
  });

  nextProps.messages.forEach(msg => {
    const id = msg.messageId === 0 ? `temp-${msg.tempId || msg.timestamp.getTime()}` : msg.messageId;
    nextIds.add(id);
  });

  // Check for changes in message lists
  if (prevIds.size !== nextIds.size) {
    return false;
  }

  for (const id of prevIds) {
    if (!nextIds.has(id)) {
      return false;
    }
  }

  // Also check for changes in initialExpandedReplies
  if (JSON.stringify(prevProps.initialExpandedReplies) !== JSON.stringify(nextProps.initialExpandedReplies)) {
    return false;
  }

  // No changes that require re-rendering
  return true;
});

export default MessageList;