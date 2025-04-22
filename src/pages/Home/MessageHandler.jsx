// src/pages/Home/MessageHandler.jsx
import { ethers } from 'ethers';
import { safeToNumber } from '../../utils/messageHelpers';

/**
 * Factory function for creating message handler methods
 */
const MessageHandler = ({
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
}) => {
    const { trackPendingMessage, updatePendingMessage, cleanupResolvedMessages } = pendingMessagesState;
    const { dispatch, messageIdCache } = messageState;

    // Handle WebSocket new message event
    const handleWebSocketNewMessage = (data) => {
        // Check if this is our own message
        if (data.sender.toLowerCase() === account?.toLowerCase()) {
            console.log('New message from our account via WebSocket, checking pending');

            const unresolvedMessages = pendingMessagesState.pendingMessages.filter(msg => !msg.resolved);

            for (const pendingMsg of unresolvedMessages) {
                if (pendingMsg.content === data.content) {
                    console.log(`Found matching pending message via WebSocket`);
                    updatePendingMessage(pendingMsg.id, {
                        resolved: true,
                        resolvedId: data.messageId,
                        resolvedTimestamp: Date.now()
                    });

                    // Start cooldown since our message was confirmed
                    if (updateLastMessageTimestamp) {
                        updateLastMessageTimestamp(Date.now());
                    }

                    // Update UI
                    messageIdCache.current.clear();
                    loadMessages(0, false);
                    break;
                }
            }
        }

        // Clear cache for new messages
        messageIdCache.current.clear();

        if (messageState.autoRefresh) {
            loadMessages(0, false);
        } else {
            dispatch({ type: 'SET_NEW_MESSAGES_COUNT', count: messageState.newMessagesCount + 1 });
        }

        // Update lastKnownMessageId
        const messageId = safeToNumber(data.messageId);
        if (messageId > messageState.lastKnownMessageId) {
            dispatch({ type: 'SET_LAST_KNOWN_MESSAGE_ID', id: messageId });
        }
    };

    // Handle WebSocket new reply event
    const handleWebSocketNewReply = (data) => {
        // Check if this is our own reply
        if (data.sender.toLowerCase() === account?.toLowerCase()) {
            console.log('New reply from our account via WebSocket');

            const unresolvedMessages = pendingMessagesState.pendingMessages.filter(msg =>
                !msg.resolved && msg.isReply
            );

            for (const pendingMsg of unresolvedMessages) {
                if (safeToNumber(pendingMsg.replyToMessageId) === safeToNumber(data.replyToMessageId)) {
                    console.log(`Found matching pending reply via WebSocket`);
                    updatePendingMessage(pendingMsg.id, {
                        resolved: true,
                        resolvedId: data.messageId,
                        resolvedTimestamp: Date.now()
                    });

                    // Start cooldown since our reply was confirmed
                    if (updateLastMessageTimestamp) {
                        updateLastMessageTimestamp(Date.now());
                    }

                    // Update UI
                    messageIdCache.current.clear();
                    loadMessages(0, false);
                    break;
                }
            }
        }

        if (data.replyToMessageId) {
            console.log(`Updating reply count for message ${data.replyToMessageId}`);
            dispatch({ 
                type: 'UPDATE_REPLY_COUNT', 
                messageId: safeToNumber(data.replyToMessageId) 
            });
        }

        // Expand replies for this message
        setExpandedRepliesState(prev => ({
            ...prev,
            [safeToNumber(data.replyToMessageId)]: true
        }));

        if (messageState.autoRefresh) {
            loadMessages(0, false);
        }
    };

    // Handle contract new message event
    const handleNewMessageEvent = (messageId, sender, content, timestamp) => {
        console.log('New message event detected, ID:', safeToNumber(messageId));
        
        // Check if it's our message
        if (sender.toLowerCase() === account?.toLowerCase()) {
            console.log('This is our own message, checking pending messages');

            // Start cooldown since our message was confirmed
            if (updateLastMessageTimestamp) {
                updateLastMessageTimestamp(Date.now());
            }

            const unresolvedMessages = pendingMessagesState.pendingMessages.filter(msg =>
                !msg.resolved && !msg.isReply
            );

            for (const pendingMsg of unresolvedMessages) {
                if (pendingMsg.content === content) {
                    console.log(`Found matching pending message for event, updating status for ${pendingMsg.id}`);
                    updatePendingMessage(pendingMsg.id, {
                        resolved: true,
                        resolvedId: safeToNumber(messageId),
                        resolvedTimestamp: Date.now()
                    });

                    // Update UI
                    messageIdCache.current.clear();
                    invalidateServerCache();
                    loadMessages(0, false);
                    break;
                }
            }
        }

        // Clear cache
        messageIdCache.current.clear();

        if (messageState.autoRefresh) {
            loadMessages(0, false);
        } else {
            dispatch({ type: 'SET_NEW_MESSAGES_COUNT', count: messageState.newMessagesCount + 1 });
        }
    };

    // Handle contract new reply event
    const handleNewReplyEvent = (messageId, sender, replyToMessageId, timestamp) => {
        console.log('New reply event detected:', {
            messageId: safeToNumber(messageId),
            sender,
            replyToMessageId: safeToNumber(replyToMessageId)
        });

        dispatch({ 
            type: 'UPDATE_REPLY_COUNT', 
            messageId: safeToNumber(replyToMessageId)
        });

        // Check if it's our reply
        if (sender.toLowerCase() === account?.toLowerCase()) {
            console.log('This is our own reply, checking pending messages');

            // Start cooldown since our reply was confirmed
            if (updateLastMessageTimestamp) {
                updateLastMessageTimestamp(Date.now());
            }

            const unresolvedMessages = pendingMessagesState.pendingMessages.filter(msg =>
                !msg.resolved && msg.isReply
            );

            for (const pendingMsg of unresolvedMessages) {
                if (safeToNumber(pendingMsg.replyToMessageId) === safeToNumber(replyToMessageId)) {
                    console.log(`Found matching pending reply for event, updating status for ${pendingMsg.id}`);
                    updatePendingMessage(pendingMsg.id, {
                        resolved: true,
                        resolvedId: safeToNumber(messageId),
                        resolvedTimestamp: Date.now()
                    });

                    // Update UI
                    messageIdCache.current.clear();
                    invalidateServerCache();
                    loadMessages(0, false);
                    break;
                }
            }
        }

        // Expand replies
        setExpandedRepliesState(prev => ({
            ...prev,
            [safeToNumber(replyToMessageId)]: true
        }));

        if (messageState.autoRefresh) {
            loadMessages(0, false);
        }
    };

    // Handle message deleted event
    const handleMessageDeletedEvent = (messageId, sender) => {
        const numericId = safeToNumber(messageId);
        console.log('Message deleted event detected:', numericId);

        // Clear cache
        messageIdCache.current.clear();

        // Remove from UI
        dispatch({ type: 'DELETE_MESSAGE', messageId: numericId });
    };

    // Handle old messages deleted event
    const handleOldMessagesDeletedEvent = (count) => {
        console.log('Bulk message deletion detected, count:', safeToNumber(count));

        // Clear cache
        messageIdCache.current.clear();

        // Refresh messages
        loadMessages(0, false);
    };

    // Handle send message
    const handleSendMessage = async (content) => {
        if (!contract || !account) return;

        try {
            if (!hasProfile) {
                alert('Create a profile first to send messages');
                return;
            }

            dispatch({ type: 'LOADING_START' });
            console.log('Sending message:', content);

            // Create temporary message with unique ID for tracking
            const tempId = Date.now().toString();

            // Add message to UI with "Processing" status immediately
            const tempMessage = {
                messageId: 0,
                displayId: 'Pending',
                sender: account,
                nickname: userProfile?.nickname || `${account.slice(0, 6)}...${account.slice(-4)}`,
                content,
                timestamp: new Date(),
                isReply: false,
                replyToMessageId: 0,
                tempId,
                status: 'processing'
            };

            // Update UI
            const updatedMessages = [
                tempMessage,
                ...messageState.messages.filter(m => !(m.messageId === 0 && m.content === content))
            ];

            dispatch({
                type: 'SET_MESSAGES',
                messages: updatedMessages,
                page: messageState.currentPage,
                append: false,
                hasMore: messageState.hasMorePages
            });

            // Update signer
            let updatedContract = contract;
            try {
                if (window.ethereum) {
                    const provider = new ethers.providers.Web3Provider(window.ethereum);
                    await provider.send("eth_requestAccounts", []);
                    const signer = provider.getSigner();
                    updatedContract = contract.connect(signer);
                    console.log('Signer updated before sending transaction');
                }
            } catch (signerError) {
                console.error('Error updating signer:', signerError);

                // Update message status to "failed"
                updateMessageStatus(tempId, 'failed', 'Failed to connect to wallet');
                return;
            }

            // Set timeout for automatic update of hanging message status
            const messageTimeout = setTimeout(() => {
                console.log(`Message ${tempId} processing timeout - marking as possibly failed`);
                updateMessageStatus(tempId, 'timeout', 'Transaction may be pending in your wallet');
            }, 30000); // 30 seconds

            let tx;
            try {
                // Send transaction
                tx = await updatedContract.postMessage(content);
                console.log('Message transaction sent:', tx.hash);

                // Update status to "pending confirmation"
                updateMessageStatus(tempId, 'pending', tx.hash);

                // Track temporary message in the system
                trackPendingMessage(
                    content,
                    tx.hash,
                    false,
                    null,
                    account,
                    userProfile?.nickname,
                    tempId
                );
            } catch (txError) {
                // Handle transaction send error
                console.error('Error sending transaction:', txError);
                clearTimeout(messageTimeout);
                updateMessageStatus(tempId, 'failed', txError.message);
                return;
            }

            // Wait for transaction confirmation
            try {
                const receipt = await tx.wait();
                clearTimeout(messageTimeout);
                console.log('Transaction confirmed:', receipt);

                // Extract message ID from logs
                let messageId = null;
                if (receipt && receipt.logs) {
                    for (const log of receipt.logs) {
                        try {
                            const parsed = updatedContract.interface.parseLog(log);
                            if (parsed.name === "MessageSent") {
                                messageId = parsed.args.messageId.toString();
                                console.log(`Found message ID in logs: ${messageId}`);
                                break;
                            }
                        } catch (e) {
                            console.warn('Error parsing log:', e);
                        }
                    }
                }

                if (messageId) {
                    // Update status to "confirmed" with message ID
                    updateMessageStatus(tempId, 'confirmed', messageId);
                    updatePendingMessage(tempId, {
                        resolved: true,
                        resolvedId: messageId,
                        resolvedTimestamp: Date.now()
                    });
                    
                    // Set cooldown time after confirmation
                    if (updateLastMessageTimestamp) {
                        updateLastMessageTimestamp(Date.now());
                    }
                } else {
                    // If ID not found in logs, but transaction successful, consider message sent
                    console.warn('Message confirmed but ID not found in logs');
                    updateMessageStatus(tempId, 'confirmed', 'unknown');
                    
                    // Set cooldown time after confirmation
                    if (updateLastMessageTimestamp) {
                        updateLastMessageTimestamp(Date.now());
                    }
                }

                // Update cache and UI
                messageIdCache.current.clear();
                await invalidateServerCache();

                // Reload messages with delay
                setTimeout(() => {
                    loadMessages(0, false);
                    cleanupResolvedMessages();
                }, 1000);
            } catch (confirmError) {
                // Handle confirmation error
                console.error('Error confirming transaction:', confirmError);
                clearTimeout(messageTimeout);
                updateMessageStatus(tempId, 'failed', confirmError.message);
            }
        } catch (error) {
            // Handle general errors
            console.error('Error in handleSendMessage:', error);

            if (error.message.includes('UNSUPPORTED_OPERATION') ||
                error.message.includes('requires a signer')) {
                setSignerError(true);
                alert('Wallet connection problem. Please check your MetaMask connection');
            } else if (error.message.includes('user rejected transaction') ||
                error.message.includes('User denied')) {
                alert('Transaction rejected in wallet');
            } else {
                alert(`Error sending message: ${error.message}`);
            }
        } finally {
            dispatch({ type: 'LOADING_END' });
        }
    };

    // Helper function to update message status
    const updateMessageStatus = (tempId, status, details) => {
        const updatedMessages = messageState.messages.map(msg => {
            if (msg.tempId === tempId) {
                return {
                    ...msg,
                    status,
                    statusDetails: details
                };
            }
            return msg;
        });

        dispatch({
            type: 'SET_MESSAGES',
            messages: updatedMessages,
            page: messageState.currentPage,
            append: false,
            hasMore: messageState.hasMorePages
        });

        console.log(`Message ${tempId} status updated to ${status}`, details);
    };

    // Handle reply to message
    const handleReplyMessage = async (messageId, content) => {
        if (!contract || !account) {
            alert('You need to connect your wallet to reply to messages');
            return;
        }

        try {
            if (!hasProfile) {
                alert('Create a profile first to send messages');
                return;
            }

            const numericMessageId = safeToNumber(messageId);
            console.log(`Replying to message ID: ${numericMessageId}`);

            dispatch({ type: 'LOADING_START' });

            // Update signer
            let updatedContract = contract;
            if (window.ethereum) {
                try {
                    const provider = new ethers.providers.Web3Provider(window.ethereum);
                    await provider.send("eth_requestAccounts", []);
                    const signer = provider.getSigner();
                    updatedContract = contract.connect(signer);
                } catch (err) {
                    console.error('Error updating signer:', err);
                }
            }

            // Get original message info
            let originalMessage = null;
            try {
                const origMsg = await contract.getMessage(numericMessageId);
                if (origMsg && origMsg.sender !== ethers.constants.AddressZero) {
                    originalMessage = {
                        messageId: numericMessageId,
                        displayId: numericMessageId,
                        sender: origMsg.sender,
                        nickname: origMsg.nickname || `${origMsg.sender.slice(0, 6)}...${origMsg.sender.slice(-4)}`,
                        content: origMsg.content.slice(0, 30) + (origMsg.content.length > 30 ? '...' : '')
                    };
                }
            } catch (err) {
                console.warn(`Could not get original message for reply`);
            }

            // Send reply
            const tx = await updatedContract.replyToMessage(numericMessageId, content);
            console.log('Reply transaction sent:', tx.hash);

            // Track reply
            const tempId = trackPendingMessage(
                content,
                tx.hash,
                true,
                numericMessageId,
                account,
                userProfile?.nickname
            );

            // Add temporary reply to UI
            const tempReply = {
                messageId: 0,
                displayId: 'Pending',
                sender: account,
                nickname: userProfile?.nickname || `${account.slice(0, 6)}...${account.slice(-4)}`,
                content,
                timestamp: new Date(),
                isReply: true,
                replyToMessageId: numericMessageId,
                originalMessage,
                tempId,
                txHash: tx.hash
            };

            // Update message list with temporary reply
            const updatedMessages = [
                tempReply,
                ...messageState.messages.filter(m =>
                    !(m.messageId === 0 && m.content === content && m.isReply && m.replyToMessageId === numericMessageId)
                )
            ];

            dispatch({
                type: 'SET_MESSAGES',
                messages: updatedMessages,
                page: messageState.currentPage,
                append: false,
                hasMore: messageState.hasMorePages
            });

            // Create transaction check interval
            const txCheckInterval = setInterval(async () => {
                try {
                    const receipt = await provider.getTransactionReceipt(tx.hash);
                    if (receipt && receipt.status === 1) {
                        console.log('Reply transaction confirmed:', tx.hash);

                        // Extract ID from logs
                        let replyId = null;
                        if (receipt.logs) {
                            for (const log of receipt.logs) {
                                try {
                                    const parsedLog = updatedContract.interface.parseLog(log);
                                    if (parsedLog.name === 'ReplyMessageSent') {
                                        replyId = parsedLog.args.messageId.toString();
                                        break;
                                    }
                                } catch (e) {
                                    // Ignore parsing errors
                                }
                            }
                        }

                        // Update pending message
                        updatePendingMessage(tempId, {
                            resolved: true,
                            resolvedId: replyId,
                            resolvedTimestamp: Date.now()
                        });
                        
                        // Start cooldown after confirmation
                        if (updateLastMessageTimestamp) {
                            updateLastMessageTimestamp(Date.now());
                        }

                        // Stop checking and update UI
                        clearInterval(txCheckInterval);
                        await invalidateServerCache();

                        setTimeout(() => {
                            loadMessages(0, false);
                            cleanupResolvedMessages();
                        }, 1000);
                    }
                } catch (err) {
                    console.error('Error checking reply transaction:', err);
                }
            }, 3000);

            // Wait for confirmation
            const receipt = await tx.wait();
            console.log('Reply transaction receipt:', receipt);

            // Extract ID from logs
            let replyId = null;
            if (receipt && receipt.logs) {
                for (const log of receipt.logs) {
                    try {
                        const parsed = updatedContract.interface.parseLog(log);
                        if (parsed.name === "ReplyMessageSent") {
                            replyId = parsed.args.messageId.toString();
                            console.log(`Found reply message ID: ${replyId}`);
                            break;
                        }
                    } catch (e) {
                        // Ignore errors
                    }
                }
            }

            // Update temporary message with real ID
            if (replyId) {
                updatePendingMessage(tempId, {
                    resolved: true,
                    resolvedId: replyId,
                    resolvedTimestamp: Date.now()
                });
                
                // Start cooldown after confirmation
                if (updateLastMessageTimestamp) {
                    updateLastMessageTimestamp(Date.now());
                }
            }

            // Clear cache and update UI
            messageIdCache.current.clear();
            await invalidateServerCache();

            // Expand replies for this message
            setExpandedRepliesState(prev => ({ ...prev, [numericMessageId]: true }));

            // Update messages after delay
            setTimeout(() => {
                loadMessages(0, false);
                cleanupResolvedMessages();
            }, 1500);

        } catch (error) {
            console.error('Error sending reply:', error);

            if (error.message.includes('UNSUPPORTED_OPERATION') ||
                error.message.includes('requires a signer')) {
                setSignerError(true);
                alert('Wallet connection problem. Please check your MetaMask connection');
            } else if (error.message.includes('Original message does not exist')) {
                alert('The message you are trying to reply to does not exist');
            } else if (error.message.includes('Please wait before posting again')) {
                alert('Please wait before posting another message (cooldown period)');
            } else {
                alert(`Error: ${error.message.split('\n')[0]}`);
            }
        } finally {
            dispatch({ type: 'LOADING_END' });
        }
    };

    // Handle delete message
    const handleDeleteMessage = async (messageId) => {
        if (!contract || !account) {
            console.error('Contract or account not available for deletion');
            return;
        }

        const numericMessageId = safeToNumber(messageId);
        console.log('Deleting message with ID:', numericMessageId);

        try {
            dispatch({
                type: 'SET_DELETION_STATUS',
                status: { pending: true, messageId: numericMessageId, error: null }
            });
            dispatch({ type: 'LOADING_START' });

            // Update signer
            let updatedContract = contract;
            try {
                if (window.ethereum) {
                    const provider = new ethers.providers.Web3Provider(window.ethereum);
                    await provider.send("eth_requestAccounts", []);
                    const signer = provider.getSigner();
                    updatedContract = contract.connect(signer);
                    console.log('Signer updated before deleting message');
                }
            } catch (signerError) {
                console.error('Error updating signer:', signerError);
            }

            const tx = await updatedContract.markMessageAsDeleted(numericMessageId);
            console.log('Deletion transaction sent:', tx.hash);

            await tx.wait();
            console.log('Deletion transaction confirmed');

            // Clear cache
            messageIdCache.current.clear();
            await invalidateServerCache();

            // Remove from UI
            dispatch({ type: 'DELETE_MESSAGE', messageId: numericMessageId });

            console.log('Message deleted successfully');
        } catch (error) {
            console.error('Error deleting message:', error);
            dispatch({
                type: 'SET_DELETION_STATUS',
                status: { pending: false, messageId: numericMessageId, error: error.message }
            });

            if (error.message.includes('UNSUPPORTED_OPERATION') ||
                error.message.includes('requires a signer')) {
                setSignerError(true);
                alert('Wallet connection problem. Please check your MetaMask connection');
            } else if (error.message.includes('Message does not exist')) {
                alert('Error: This message no longer exists in the contract');
            } else if (error.message.includes('Not authorized')) {
                alert('Error: You are not authorized to delete this message');
            } else if (error.message.includes('Message already deleted')) {
                alert('This message has already been deleted');
                loadMessages(0, false);
            } else {
                alert(`Error deleting message: ${error.message}`);
            }
        } finally {
            dispatch({ type: 'LOADING_END' });
            setTimeout(() => {
                dispatch({
                    type: 'SET_DELETION_STATUS',
                    status: { pending: false, messageId: null, error: null }
                });
            }, 3000);
        }
    };

    // Return all handler methods
    return {
        handleWebSocketNewMessage,
        handleWebSocketNewReply,
        handleNewMessageEvent,
        handleNewReplyEvent,
        handleMessageDeletedEvent,
        handleOldMessagesDeletedEvent,
        handleSendMessage,
        handleReplyMessage,
        handleDeleteMessage
    };
};

export default MessageHandler;