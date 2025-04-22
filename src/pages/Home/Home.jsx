// src/pages/Home/Home.jsx
import React, { useEffect, useRef, useCallback } from 'react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useStats } from '../../contexts/StatsContext';
import MessageForm from '../../components/MessageForm';
import MessageList from '../../components/MessageList';
import PureSVGPreloader from '../../components/PureSVGPreloader';
import { ethers } from 'ethers';
import { scrollToMessage } from '../../utils/messageHelpers';
import useMessageManagement from '../../hooks/useMessageManagement';
import usePendingMessages from '../../hooks/usePendingMessages';
import MessageActions from './MessageActions';
import DebugPanel from './DebugPanel';
import NewMessageAlert from './NewMessageAlert';
import MessageHandler from './MessageHandler';

// Constants
const POLLING_INTERVAL = 15000;
const AUTO_REFRESH_INTERVAL = 30000;

function Home() {
    const { account, contract, provider, wsConnection, userProfile, lastMessageTimestamp, updateLastMessageTimestamp, connectionStatus, contractParameters } = useWeb3();
    const { setMessageTimestamps } = useStats();

    // References
    const pollingIntervalRef = useRef(null);
    const autoRefreshIntervalRef = useRef(null);
    const scrollObserverRef = useRef(null);
    const pendingCheckIntervalsRef = useRef([]);

    // Get pending messages hook
    const pendingMessagesState = usePendingMessages();
    const { pendingMessages } = pendingMessagesState;

    // Get message management hook
    const messageState = useMessageManagement(
        contract,
        provider,
        setMessageTimestamps,
        pendingMessagesState
    );

    const {
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
    } = messageState;

    // Check if user has a profile
    const hasProfile = userProfile?.isActive && userProfile?.nickname;

    // Get message handler methods
    const messageHandler = MessageHandler({
        account,
        contract,
        provider,
        userProfile,
        hasProfile,
        loadMessages,
        pendingMessagesState,
        messageState,
        invalidateServerCache,
        setSignerError,
        setExpandedRepliesState,
        updateLastMessageTimestamp
    });

    // Setup Intersection Observer for infinite scroll
    useEffect(() => {
        if (!hasMorePages || loading) return;

        const handleIntersection = (entries) => {
            const [entry] = entries;
            if (entry.isIntersecting && !loading && hasMorePages) {
                console.log('Loading more messages due to scroll...');
                loadMoreMessages();
            }
        };

        const observer = new IntersectionObserver(handleIntersection, {
            root: null,
            rootMargin: '0px 0px 300px 0px', // Larger margin for earlier loading
            threshold: 0.1
        });

        const currentObserverRef = scrollObserverRef.current;
        if (currentObserverRef) {
            console.log('Observer set up on element');
            observer.observe(currentObserverRef);
        }

        return () => {
            if (currentObserverRef) {
                observer.unobserve(currentObserverRef);
            }
            observer.disconnect();
        };
    }, [hasMorePages, loading, loadMoreMessages]);

    // Setup polling for new messages
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

    // Load initial messages
    useEffect(() => {
        if (contract && !initialLoadCompleted.current) {
            console.log('Initial load effect triggered');
            initialLoadCompleted.current = true;
            loadMessages(0, false);
        }
    }, [contract, loadMessages, initialLoadCompleted]);

    // Clean up intervals on unmount
    useEffect(() => {
        return () => {
            pendingCheckIntervalsRef.current.forEach(interval => {
                clearInterval(interval);
            });
            pendingCheckIntervalsRef.current = [];
        };
    }, []);

    // WebSocket event handlers
    useEffect(() => {
        if (!wsConnection) return;

        const handleWebSocketMessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message received:', data);

                switch (data.type) {
                    case 'newMessage':
                        messageHandler.handleWebSocketNewMessage(data);
                        break;

                    case 'newReply':
                        messageHandler.handleWebSocketNewReply(data);

                        // Update reply count
                        const replyToMessageId = parseInt(data.replyToMessageId);
                        dispatch({
                            type: 'UPDATE_REPLY_COUNT',
                            messageId: replyToMessageId
                        });

                        // Ensure replies are shown
                        setExpandedRepliesState(prev => ({
                            ...prev,
                            [replyToMessageId]: true
                        }));
                        break;

                    case 'messageDeleted':
                        console.log('Message deleted event received:', data.messageId);
                        messageIdCache.current.clear();
                        dispatch({ type: 'DELETE_MESSAGE', messageId: parseInt(data.messageId) });
                        break;

                    case 'oldMessagesDeleted':
                        console.log('Old messages deleted event received:', data.count);
                        messageIdCache.current.clear();
                        loadMessages(0, false);
                        break;
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };

        wsConnection.addEventListener('message', handleWebSocketMessage);

        return () => {
            wsConnection.removeEventListener('message', handleWebSocketMessage);
        };
    }, [wsConnection, messageHandler, loadMessages, messageIdCache, dispatch, setExpandedRepliesState]);

    // Contract event listeners
    useEffect(() => {
        if (!contract) return;

        const messageSentFilter = contract.filters.MessageSent();
        const messageDeletedFilter = contract.filters.MessageDeleted();
        const oldMessagesDeletedFilter = contract.filters.OldMessagesDeleted();
        const replyMessageSentFilter = contract.filters.ReplyMessageSent();

        contract.on(messageSentFilter, messageHandler.handleNewMessageEvent);
        contract.on(replyMessageSentFilter, messageHandler.handleNewReplyEvent);
        contract.on(messageDeletedFilter, messageHandler.handleMessageDeletedEvent);
        contract.on(oldMessagesDeletedFilter, messageHandler.handleOldMessagesDeletedEvent);

        return () => {
            contract.off(messageSentFilter, messageHandler.handleNewMessageEvent);
            contract.off(replyMessageSentFilter, messageHandler.handleNewReplyEvent);
            contract.off(messageDeletedFilter, messageHandler.handleMessageDeletedEvent);
            contract.off(oldMessagesDeletedFilter, messageHandler.handleOldMessagesDeletedEvent);
        };
    }, [contract, messageHandler]);

    return (
        <div className="mx-auto">
            {/* Loading indicator */}
            {loading && (
                <div className="fixed top-0 left-0 w-full z-50">
                    <div className="h-1 bg-sky-500 animate-pulse"></div>
                </div>
            )}

            {/* Message form for authenticated users */}
            {account && hasProfile && (
                <div className='max-w-xl mx-auto'>
                    <MessageForm
                        onSendMessage={messageHandler.handleSendMessage}
                        disabled={loading}
                    />
                </div>
            )}

            {/* Message actions header */}
            <MessageActions
                autoRefresh={autoRefresh}
                lastCheckedTimestamp={lastCheckedTimestamp}
                loading={loading}
                onToggleAutoRefresh={toggleAutoRefresh}
                onRefresh={handleRefreshMessages}
            />

            {/* Message list */}
            {initialLoading ? (
                <div className="text-center py-10">
                    <PureSVGPreloader />
                    <p className="mt-2 font-mono text-gray-400">Loading messages...</p>
                </div>
            ) : messages.length > 0 ? (
                <>
                    <MessageList
                        messages={messages}
                        currentUser={account}
                        onDelete={messageHandler.handleDeleteMessage}
                        onReply={messageHandler.handleReplyMessage}
                        onScrollToMessage={scrollToMessage}
                        pendingDeletion={deletionStatus.pending ? parseInt(deletionStatus.messageId) : null}
                        initialExpandedReplies={expandedRepliesState}
                    />

                    {/* Infinite scroll observer */}
                    {hasMorePages && (
                        <div ref={scrollObserverRef} className="text-center mt-4 mb-8">
                            {loading ? (
                                <div className="flex justify-center items-center py-4">
                                    <div className="w-10 h-10">
                                        <PureSVGPreloader />
                                    </div>
                                    <span className="ml-3 font-mono text-xs text-gray-400">Loading more messages...</span>
                                </div>
                            ) : (
                                <div className="h-20"></div>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-10">
                    <p className="font-mono text-gray-400">No messages found</p>
                </div>
            )}

            {/* New messages notification */}
            <NewMessageAlert
                count={newMessagesCount}
                loading={loading}
                autoRefresh={autoRefresh}
                onRefresh={handleRefreshMessages}
            />

            {/* Debug panel */}
            <DebugPanel
                account={account}
                contract={contract}
                hasProfile={hasProfile}
                messages={messages}
                messageIdCache={messageIdCache}
                loading={loading}
                autoRefresh={autoRefresh}
                newMessagesCount={newMessagesCount}
                lastKnownMessageId={lastKnownMessageId}
                pendingMessages={pendingMessages}
                messageTimestampsRef={messageTimestampsRef}
                deletionStatus={deletionStatus}
                totalMessagesCountRef={{ current: 0 }}
                connectionStatus={connectionStatus}
                wsConnection={wsConnection}
                contractParameters={contractParameters}
                expandedRepliesState={expandedRepliesState}
            />
        </div>
    );
}

export default Home;