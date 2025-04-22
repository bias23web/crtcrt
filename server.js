// server.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { ethers } from 'ethers';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import NodeCache from 'node-cache';

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Load environment variables
dotenv.config();

// Import contract ABI
const contractABI = require('./contractABI.json');
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const RPC_URL = process.env.RPC_URL;
const PORT = process.env.PORT || 3000;

// Initialize server-side cache
const cache = new NodeCache({
  stdTTL: 60, // Default cache TTL - 60 seconds
  checkperiod: 120 // Check for expired keys every 120 seconds
});

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Static files for frontend
app.use(express.static(path.join(__dirname, 'dist')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Initialize provider and contract
let provider;
let contract;

try {
  provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
  console.log("Contract and provider initialized successfully");
} catch (error) {
  console.error("Error initializing provider or contract:", error);
}

// Store active WebSocket connections
const connectedClients = new Map();

// Initialize message ID mapping for efficient lookups
const messageIdMap = new Map();

// Helper function to format messages
const formatMessage = (msg) => ({
  messageId: msg.messageId ? msg.messageId.toString() : msg.timestamp.toString(),
  displayId: safeToNumber(msg.messageId) < 1000000 ? msg.messageId.toString() : msg.messageId.toString().substr(-2),
  sender: msg.sender,
  nickname: msg.nickname || `${msg.sender.slice(0, 6)}...${msg.sender.slice(-4)}`,
  content: msg.content,
  timestamp: parseInt(msg.timestamp.toString()) * 1000, // Convert to milliseconds
  isReply: msg.replyToMessageId && msg.replyToMessageId.toString() !== '0',
  replyToMessageId: msg.replyToMessageId ? msg.replyToMessageId.toString() : '0',
  isDeleted: msg.isDeleted
});

// Helper function to safely convert BigNumber to Number
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

// Helper function to find message IDs efficiently
const findMessageId = async (message) => {
  // Create a unique key based on sender, content, and timestamp
  const timestamp = safeToNumber(message.timestamp);
  const key = `${message.sender}-${message.content.slice(0, 20)}-${timestamp}`;

  // Check if we have this message ID in our map
  if (messageIdMap.has(key)) {
    return messageIdMap.get(key);
  }

  // Otherwise, search for it in the contract
  try {
    const count = await contract.getMessageCount();
    const messageCount = safeToNumber(count);

    // Search most recent messages first (limited to prevent huge searches)
    const searchLimit = Math.min(500, messageCount);

    for (let i = messageCount - 1; i > messageCount - searchLimit && i > 0; i--) {
      const candidate = await contract.getMessage(i);

      if (candidate.sender === message.sender &&
        candidate.content === message.content &&
        safeToNumber(candidate.timestamp) === timestamp) {
        // Found the message, save it in our map
        messageIdMap.set(key, i);
        return i;
      }
    }

    // If not found, use timestamp as fallback
    return timestamp;
  } catch (error) {
    console.error('Error finding message ID:', error);
    return timestamp; // Fallback to timestamp
  }
};

// Endpoint for getting all messages with pagination
app.get('/api/messages/all', async (req, res) => {
  try {
    // Get parameters from request
    const limit = parseInt(req.query.limit) || 1000; // Maximum number of messages
    const page = parseInt(req.query.page) || 0; // Page (starting from 0)
    const pageSize = parseInt(req.query.pageSize) || 100; // Page size
    const showDeleted = req.query.showDeleted === 'true'; // Include deleted messages

    console.log(`Request for all messages: limit=${limit}, page=${page}, pageSize=${pageSize}, showDeleted=${showDeleted}`);

    // Check cache
    const cacheKey = `all-messages-${limit}-${page}-${pageSize}-${showDeleted}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    console.log(`Cache miss for ${cacheKey}, fetching from contract...`);

    // Get total message count from contract
    const count = await contract.getMessageCount();
    const messageCount = safeToNumber(count);
    console.log(`Total message count in contract: ${messageCount}`);

    // Calculate boundaries for pagination
    const start = Math.max(1, messageCount - limit - (page * pageSize)); // Start from the end (newest first)
    const end = Math.min(messageCount, start + pageSize);

    console.log(`Retrieving messages from ID ${start} to ${end}`);

    // Get messages in the specified range
    const messagePromises = [];
    for (let i = end - 1; i >= start; i--) {
      messagePromises.push(
        contract.getMessage(i)
          .then(msg => ({
            ...msg,
            messageId: i
          }))
          .catch(err => {
            console.error(`Error fetching message ID ${i}: ${err.message}`);
            return null;
          })
      );
    }

    // Wait for all requests to complete
    let messages = await Promise.all(messagePromises);

    // Filter invalid and deleted messages
    messages = messages
      .filter(msg => {
        if (!msg) return false;
        // if (msg.sender === ethers.constants.AddressZero) return false;
        if (!showDeleted && msg.isDeleted) return false;
        return true;
      })
      .map(msg => ({
        messageId: msg.messageId,
        sender: msg.sender,
        nickname: msg.nickname || `${msg.sender.slice(0, 6)}...${msg.sender.slice(-4)}`,
        content: msg.content,
        timestamp: safeToNumber(msg.timestamp) * 1000, // In milliseconds for client
        isReply: safeToNumber(msg.replyToMessageId) !== 0,
        replyToMessageId: safeToNumber(msg.replyToMessageId),
        isDeleted: msg.isDeleted
      }));

    // Check if there are more messages for the next page
    const hasMore = start > 1;

    // Format response
    const result = {
      messages,
      totalCount: messageCount,
      hasMore,
      page,
      pageSize,
      first: start,
      last: end,
      timestamp: Date.now()
    };

    // Cache result for 1 minute
    cache.set(cacheKey, result, 60);

    console.log(`Returning ${messages.length} messages`);
    res.json(result);
  } catch (error) {
    console.error('Error fetching all messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint for feed with replies
app.get('/api/messages/feedWithReplies/:page/:pageSize', async (req, res) => {
  try {
    const { page, pageSize } = req.params;
    const numPage = parseInt(page);
    const numPageSize = parseInt(pageSize);

    console.log(`Fetching feed with replies, page ${numPage}, size ${numPageSize}`);

    // Check cache
    const cacheKey = `feed-with-replies-${numPage}-${numPageSize}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    // Get total message count 
    const count = await contract.getMessageCount();
    const messageCount = safeToNumber(count);

    // Calculate ID range for retrieving messages
    const start = Math.max(1, messageCount - numPageSize - (numPage * numPageSize));
    const end = Math.min(messageCount, start + numPageSize);

    console.log(`Fetching messages with IDs from ${start} to ${end}`);

    // Get messages directly by ID
    const messagePromises = [];
    for (let i = end - 1; i >= start; i--) {
      messagePromises.push(
        contract.getMessage(i)
          .then(msg => ({
            ...msg,
            messageId: i  // Add ID, as it's not stored in the structure
          }))
          .catch(err => null) // Skip errors
      );
    }

    // Wait for all requests to complete
    const rawMessages = await Promise.all(messagePromises);

    // Create map of original messages for quick access
    const messageMap = new Map();
    rawMessages.forEach(msg => {
      if (msg && msg.messageId) {
        messageMap.set(msg.messageId, msg);
      }
    });

    // Process results
    const processedMessages = await Promise.all(
      rawMessages
        .filter(msg => msg && !msg.isDeleted && msg.sender !== ethers.constants.AddressZero)
        .map(async (msg) => {
          const replyToMessageId = safeToNumber(msg.replyToMessageId);
          let originalMessageInfo = null;
          let replyCount = 0;

          // If this is a main message (not a reply), count the number of replies
          if (replyToMessageId === 0) {
            try {
              // Get replies for this message
              const replies = await contract.getRepliesForMessage(msg.messageId);
              // Count only non-deleted replies
              replyCount = replies.filter(r => !r.isDeleted).length;
              console.log(`Message ID ${msg.messageId} has ${replyCount} replies`);
            } catch (error) {
              console.error(`Error getting reply count for message ${msg.messageId}:`, error);
            }
          }

          // If this is a reply, add information about the original message
          if (replyToMessageId !== 0) {
            // First check if the message is in our map
            if (messageMap.has(replyToMessageId)) {
              const origMsg = messageMap.get(replyToMessageId);
              originalMessageInfo = {
                messageId: replyToMessageId,
                sender: origMsg.sender,
                nickname: origMsg.nickname || `${origMsg.sender.slice(0, 6)}...${origMsg.sender.slice(-4)}`,
                content: origMsg.content.slice(0, 30) + (origMsg.content.length > 30 ? '...' : '')
              };
            } else {
              // If not in map, try to get directly
              try {
                const origMsg = await contract.getMessage(replyToMessageId);
                originalMessageInfo = {
                  messageId: replyToMessageId,
                  sender: origMsg.sender,
                  nickname: origMsg.nickname || `${origMsg.sender.slice(0, 6)}...${origMsg.sender.slice(-4)}`,
                  content: origMsg.content.slice(0, 30) + (origMsg.content.length > 30 ? '...' : '')
                };
              } catch (err) {
                console.log(`Couldn't fetch original message for reply: ${err.message}`);
              }
            }
          }

          return {
            messageId: msg.messageId,
            displayId: msg.messageId.toString(), // Add displayId for client
            sender: msg.sender,
            nickname: msg.nickname || `${msg.sender.slice(0, 6)}...${msg.sender.slice(-4)}`,
            content: msg.content,
            timestamp: safeToNumber(msg.timestamp) * 1000,
            isReply: replyToMessageId !== 0,
            replyToMessageId: replyToMessageId,
            originalMessage: originalMessageInfo,
            replyCount: replyCount // Add replyCount field
          };
        })
    );

    // Sort by time
    processedMessages.sort((a, b) => b.timestamp - a.timestamp);

    // Collect statistics
    const stats = {
      total: processedMessages.length,
      replies: processedMessages.filter(m => m.isReply).length,
      mainMessages: processedMessages.filter(m => !m.isReply).length
    };

    console.log('Message stats:', stats);

    // Format response
    const result = {
      messages: processedMessages,
      hasMore: start > 1,
      timestamp: Date.now(),
      stats: stats
    };

    // Cache result for 30 seconds
    cache.set(cacheKey, result, 30);

    res.json(result);
  } catch (error) {
    console.error('Error fetching messages with replies:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint for getting all messages without pagination
// (use only for debugging, may be slow with large number of messages)
app.get('/api/debug/allmsgs', async (req, res) => {
  try {
    console.log('Debug: Fetching all messages');

    // Get total message count
    const count = await contract.getMessageCount();
    const messageCount = safeToNumber(count);
    console.log(`Total message count: ${messageCount}`);

    // Create array for results
    const results = [];

    // Get the last 100 messages (or all, if fewer)
    const fetchLimit = Math.min(messageCount - 1, 100);
    console.log(`Will fetch the last ${fetchLimit} messages`);

    for (let i = messageCount - 1; i > messageCount - fetchLimit - 1; i--) {
      try {
        const msg = await contract.getMessage(i);
        if (msg.sender !== ethers.constants.AddressZero) {
          results.push({
            id: i,
            sender: msg.sender,
            nickname: msg.nickname || `${msg.sender.slice(0, 6)}...${msg.sender.slice(-4)}`,
            content: msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content,
            timestamp: safeToNumber(msg.timestamp) * 1000,
            isReply: safeToNumber(msg.replyToMessageId) > 0,
            replyToMessageId: safeToNumber(msg.replyToMessageId),
            isDeleted: msg.isDeleted
          });
        }
      } catch (err) {
        console.log(`Error fetching message ${i}: ${err.message}`);
      }
    }

    res.json({
      count: messageCount,
      fetchedCount: results.length,
      messages: results
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint for message IDs
app.get('/api/debug/message-ids', async (req, res) => {
  try {
    // Get total message count
    const count = await contract.getMessageCount();
    const messageCount = safeToNumber(count);

    const results = [];
    // Check the last 50 messages (can be changed if needed)
    const checkCount = Math.min(100, messageCount - 1);

    for (let i = messageCount - 1; i > messageCount - checkCount - 1; i--) {
      try {
        const msg = await contract.getMessage(i);
        if (msg.sender !== ethers.constants.AddressZero) {
          results.push({
            realId: i,
            sender: msg.sender.slice(0, 8) + '...',
            nickname: msg.nickname || 'No nickname',
            timestamp: safeToNumber(msg.timestamp),
            humanReadableTime: new Date(safeToNumber(msg.timestamp) * 1000).toISOString(),
            convertedId: await findMessageId(msg)
          });
        }
      } catch (err) {
        console.log(`Error checking message ${i}: ${err.message}`);
      }
    }

    res.json({
      totalMessages: messageCount,
      checkedMessages: checkCount,
      idMappings: results
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint for viewing a message
app.get('/api/debug/message/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = parseInt(id);
    console.log(`Debug: Fetching message with ID ${numericId}`);

    const message = await contract.getMessage(numericId);
    res.json({
      id: numericId,
      sender: message.sender,
      content: message.content,
      timestamp: safeToNumber(message.timestamp) * 1000,
      isReply: safeToNumber(message.replyToMessageId) > 0,
      replyToMessageId: safeToNumber(message.replyToMessageId),
      nickname: message.nickname || `${message.sender.slice(0, 6)}...${message.sender.slice(-4)}`,
      isDeleted: message.isDeleted
    });
  } catch (error) {
    console.error('Error fetching single message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Optimized endpoint for feed with pagination
app.get('/api/messages/feed/:page/:pageSize', async (req, res) => {
  try {
    const { page, pageSize } = req.params;
    const numPage = parseInt(page);
    const numPageSize = parseInt(pageSize);

    console.log(`Fetching feed, page ${numPage}, size ${numPageSize}`);

    // Check cache
    const cacheKey = `feed-${numPage}-${numPageSize}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    // Get messages with pagination directly from contract
    const messages = await contract.getMessagesWithPagination(numPage, numPageSize);

    // Get total message count to determine ID range
    const count = await contract.getMessageCount();
    const messageCount = safeToNumber(count);

    // Process messages
    const processedMessages = await Promise.all(
      messages
        .filter(msg => !msg.isDeleted && msg.sender !== ethers.constants.AddressZero)
        .map(async (msg, index) => {
          // Find real message ID
          const messageId = await findMessageId(msg);

          // Determine display ID
          const displayId = typeof messageId === 'object'
            ? messageId.display
            : (safeToNumber(messageId) < 100
              ? messageId.toString()
              : `${messageId.toString().substr(-2)}`);

          // Pre-load reply count
          let replyCount = 0;
          try {
            // For small IDs (likely real message IDs), get reply count
            let realMessageId = typeof messageId === 'object' ? messageId.id : messageId;

            // If ID is less than 1000, it's probably a real message ID
            if (safeToNumber(realMessageId) < 1000) {
              const replies = await contract.getRepliesForMessage(realMessageId);
              replyCount = replies.filter(r => !r.isDeleted).length;
            }
          } catch (error) {
            console.error(`Error getting reply count for message ${messageId}:`, error);
          }

          // Format message data
          return {
            messageId: typeof messageId === 'object' ? messageId.id : messageId,
            displayId: displayId,
            sender: msg.sender,
            nickname: msg.nickname || `${msg.sender.slice(0, 6)}...${msg.sender.slice(-4)}`,
            content: msg.content,
            timestamp: safeToNumber(msg.timestamp) * 1000,
            isReply: safeToNumber(msg.replyToMessageId) !== 0,
            replyToMessageId: safeToNumber(msg.replyToMessageId),
            replyCount: replyCount,
            originalId: safeToNumber(msg.replyToMessageId) // For reference to original message
          };
        })
    );

    // Sort messages by timestamp (newest first)
    processedMessages.sort((a, b) => b.timestamp - a.timestamp);

    // Format response
    const result = {
      messages: processedMessages,
      hasMore: processedMessages.length === numPageSize,
      timestamp: Date.now()
    };

    // Cache for 30 seconds
    cache.set(cacheKey, result, 30);

    res.json(result);
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Optimized endpoint for getting replies to a message
app.get('/api/messages/:messageId/replies', async (req, res) => {
  try {
    const { messageId } = req.params;
    const numericId = parseInt(messageId);

    console.log(`Request for replies to message ID/timestamp: ${messageId}`);

    // Check if this is a timestamp or a real ID
    let realMessageId = null;

    // If ID is less than 1000, it's likely a real message ID
    if (numericId < 1000) {
      realMessageId = numericId;
      console.log(`Using direct messageId: ${realMessageId}`);
    } else {
      // This is a timestamp, need to find the corresponding message
      console.log(`This appears to be a timestamp (${numericId}), need to find real message ID`);

      try {
        // Get total message count
        const count = await contract.getMessageCount();
        const messageCount = safeToNumber(count);

        // Search for message with this timestamp
        for (let i = messageCount - 1; i > Math.max(1, messageCount - 100); i--) {
          try {
            const msg = await contract.getMessage(i);
            const msgTimestamp = safeToNumber(msg.timestamp);

            if (msgTimestamp === Math.floor(numericId / 1000)) { // Convert milliseconds to seconds
              realMessageId = i;
              console.log(`Found message with ID ${i} for timestamp ${numericId}`);
              break;
            }
          } catch (err) {
            // Skip errors for individual messages
          }
        }
      } catch (err) {
        console.log(`Error searching for message by timestamp: ${err.message}`);
      }
    }

    // If we didn't find a real ID, return empty list
    if (!realMessageId) {
      console.log(`Could not find message for ID/timestamp ${messageId}, returning empty array`);
      return res.json([]);
    }

    // Now get replies using the found ID
    console.log(`Getting replies for message ID ${realMessageId}`);

    try {
      const replies = await contract.getRepliesForMessage(realMessageId);
      console.log(`Found ${replies.length} replies for message ${realMessageId}`);

      const processedReplies = replies
        .filter(reply => !reply.isDeleted && reply.sender !== ethers.constants.AddressZero)
        .map(reply => ({
          messageId: safeToNumber(reply.timestamp), // Use timestamp as ID
          sender: reply.sender,
          nickname: reply.nickname || `${reply.sender.slice(0, 6)}...${reply.sender.slice(-4)}`,
          content: reply.content,
          timestamp: safeToNumber(reply.timestamp) * 1000, // In milliseconds
          isReply: true,
          replyToMessageId: safeToNumber(messageId)
        }));

      res.json(processedReplies);
    } catch (error) {
      console.error(`Error getting replies: ${error.message}`);
      res.json([]); // Return empty array on error
    }
  } catch (error) {
    console.error('Error in replies endpoint:', error);
    res.json([]); // Always return empty array instead of error
  }
});

// API for getting latest messages (less optimized, kept for backward compatibility)
app.get('/api/messages/latest/:count', async (req, res) => {
  try {
    const count = parseInt(req.params.count) || 10;

    // Check cache
    const cacheKey = `latest-${count}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const messages = await contract.getLatestMessages(count);
    const formattedMessages = messages
      .filter(msg => !msg.isDeleted && msg.sender !== ethers.constants.AddressZero)
      .map(formatMessage);

    // Cache for 30 seconds
    cache.set(cacheKey, formattedMessages, 30);

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching latest messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// API for getting latest active message count
app.get('/api/messages/active/count', async (req, res) => {
  try {
    const count = await contract.getTotalActiveMessages();
    res.json({ count: count.toString() });
  } catch (error) {
    console.error('Error fetching active message count:', error);
    res.status(500).json({ error: error.message });
  }
});

// API for getting original message for a reply
app.get('/api/messages/:messageId/original', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Check cache
    const cacheKey = `original-${messageId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const originalMessage = await contract.getOriginalMessage(messageId);

    if (!originalMessage || originalMessage.sender === ethers.constants.AddressZero) {
      return res.status(404).json({ error: 'Original message not found' });
    }

    const formatted = {
      messageId: await findMessageId(originalMessage),
      sender: originalMessage.sender,
      nickname: originalMessage.nickname || `${originalMessage.sender.slice(0, 6)}...${originalMessage.sender.slice(-4)}`,
      content: originalMessage.content,
      timestamp: safeToNumber(originalMessage.timestamp) * 1000,
      isReply: false,
      replyToMessageId: 0
    };

    // Cache for 5 minutes (original messages don't change often)
    cache.set(cacheKey, formatted, 300);

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching original message:', error);
    if (error.message.includes('Not a reply message')) {
      return res.status(400).json({ error: 'Not a reply message' });
    }
    res.status(500).json({ error: error.message });
  }
});

// API for getting messages by sender
app.get('/api/messages/sender/:address', async (req, res) => {
  try {
    const { address } = req.params;
    if (!ethers.utils.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    // Check cache
    const cacheKey = `sender-${address}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const messages = await contract.getMessagesBySender(address);
    const formattedMessages = await Promise.all(
      messages
        .filter(msg => !msg.isDeleted)
        .map(async (msg) => {
          const baseFormatted = formatMessage(msg);

          // If it's a reply, add original message info
          if (baseFormatted.isReply && baseFormatted.replyToMessageId !== '0') {
            try {
              const origMessage = await contract.getMessage(baseFormatted.replyToMessageId);
              if (origMessage && origMessage.sender !== ethers.constants.AddressZero) {
                baseFormatted.originalMessage = {
                  messageId: baseFormatted.replyToMessageId,
                  sender: origMessage.sender,
                  nickname: origMessage.nickname || `${origMessage.sender.slice(0, 6)}...${origMessage.sender.slice(-4)}`,
                  content: origMessage.content.slice(0, 30) + (origMessage.content.length > 30 ? '...' : '')
                };
              }
            } catch (err) {
              console.log(`Couldn't fetch original message for reply ${baseFormatted.messageId}`);
            }
          }

          return baseFormatted;
        })
    );

    // Sort by timestamp, newest first
    formattedMessages.sort((a, b) => b.timestamp - a.timestamp);

    // Cache for 1 minute
    cache.set(cacheKey, formattedMessages, 60);

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages by sender:', error);
    res.status(500).json({ error: error.message });
  }
});

// API for getting messages by period
app.get('/api/messages/period/:periodId', async (req, res) => {
  try {
    const { periodId } = req.params;

    // Check cache
    const cacheKey = `period-${periodId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const periodMessages = await contract.getMessagesByPeriod(periodId);

    // Process messages with original message info for replies
    const formattedMessages = await Promise.all(
      periodMessages
        .filter(msg => !msg.isDeleted && msg.sender !== ethers.constants.AddressZero)
        .map(async (msg) => {
          const baseFormatted = formatMessage(msg);

          // If it's a reply, add original message info
          if (baseFormatted.isReply && baseFormatted.replyToMessageId !== '0') {
            try {
              const origMessage = await contract.getMessage(baseFormatted.replyToMessageId);
              if (origMessage && origMessage.sender !== ethers.constants.AddressZero) {
                baseFormatted.originalMessage = {
                  messageId: baseFormatted.replyToMessageId,
                  sender: origMessage.sender,
                  nickname: origMessage.nickname || `${origMessage.sender.slice(0, 6)}...${origMessage.sender.slice(-4)}`,
                  content: origMessage.content.slice(0, 30) + (origMessage.content.length > 30 ? '...' : '')
                };
              }
            } catch (err) {
              console.log(`Couldn't fetch original message for reply ${baseFormatted.messageId}`);
            }
          }

          return baseFormatted;
        })
    );

    // Sort by timestamp, newest first
    formattedMessages.sort((a, b) => b.timestamp - a.timestamp);

    // Cache for 2 minutes
    cache.set(cacheKey, formattedMessages, 120);

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages by period:', error);
    if (error.message.includes('Period does not exist')) {
      return res.status(404).json({ error: 'Period does not exist' });
    }
    res.status(500).json({ error: error.message });
  }
});

// API for getting available periods
app.get('/api/periods', async (req, res) => {
  try {
    // Check cache
    const cacheKey = 'available-periods';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const periods = await contract.getAvailablePeriods();
    const periodArray = periods.map(period => period.toString());

    // Cache for 5 minutes (periods don't change often)
    cache.set(cacheKey, periodArray, 300);

    res.json(periodArray);
  } catch (error) {
    console.error('Error fetching available periods:', error);
    res.status(500).json({ error: error.message });
  }
});

// API for pagination
app.get('/api/messages/page/:page/:pageSize', async (req, res) => {
  try {
    const { page, pageSize } = req.params;

    // Check cache
    const cacheKey = `page-${page}-${pageSize}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const messages = await contract.getMessagesWithPagination(
      parseInt(page),
      parseInt(pageSize)
    );

    // Process messages with original message info for replies
    const formattedMessages = await Promise.all(
      messages
        .filter(msg => !msg.isDeleted && msg.sender !== ethers.constants.AddressZero)
        .map(async (msg) => {
          const baseFormatted = formatMessage(msg);

          // If it's a reply, add original message info
          if (baseFormatted.isReply && baseFormatted.replyToMessageId !== '0') {
            try {
              const origMessage = await contract.getMessage(baseFormatted.replyToMessageId);
              if (origMessage && origMessage.sender !== ethers.constants.AddressZero) {
                baseFormatted.originalMessage = {
                  messageId: baseFormatted.replyToMessageId,
                  sender: origMessage.sender,
                  nickname: origMessage.nickname || `${origMessage.sender.slice(0, 6)}...${origMessage.sender.slice(-4)}`,
                  content: origMessage.content.slice(0, 30) + (origMessage.content.length > 30 ? '...' : '')
                };
              }
            } catch (err) {
              console.log(`Couldn't fetch original message for reply ${baseFormatted.messageId}`);
            }
          }

          return baseFormatted;
        })
    );

    // Cache for 30 seconds
    cache.set(cacheKey, formattedMessages, 30);

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages with pagination:', error);
    if (error.message.includes('Page size too large') || error.message.includes('Page size must be greater than 0')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// API for getting user profile
app.get('/api/profile/:address', async (req, res) => {
  try {
    const { address } = req.params;
    if (!ethers.utils.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    // Check cache
    const cacheKey = `profile-${address}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const [nickname, avatarCode, isActive] = await contract.getUserProfile(address);
    const profile = {
      nickname,
      avatarCode,
      isActive
    };

    // Cache for 2 minutes
    cache.set(cacheKey, profile, 120);

    res.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// API for finding address by nickname
app.get('/api/address/:nickname', async (req, res) => {
  try {
    const { nickname } = req.params;

    // Check cache
    const cacheKey = `nickname-${nickname}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const address = await contract.getAddressByNickname(nickname);

    if (address === ethers.constants.AddressZero) {
      return res.status(404).json({ error: 'Nickname not found' });
    }

    const result = { address };

    // Cache for 5 minutes
    cache.set(cacheKey, result, 300);

    res.json(result);
  } catch (error) {
    console.error('Error finding address by nickname:', error);
    res.status(500).json({ error: error.message });
  }
});

// API for getting total message count
app.get('/api/messages/count', async (req, res) => {
  try {
    const count = await contract.getMessageCount();
    res.json({ count: count.toString() });
  } catch (error) {
    console.error('Error fetching message count:', error);
    res.status(500).json({ error: error.message });
  }
});

// API for getting contract parameters
app.get('/api/parameters', async (req, res) => {
  try {
    // Check cache
    const cacheKey = 'contract-parameters';
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cachedData);
    }

    const [maxMessageLength, messageCooldown, maxReturnCount, maxActiveMessages] = await contract.getParameters();
    const parameters = {
      maxMessageLength: maxMessageLength.toString(),
      messageCooldown: messageCooldown.toString(),
      maxReturnCount: maxReturnCount.toString(),
      maxActiveMessages: maxActiveMessages.toString()
    };

    // Cache for 5 minutes (parameters don't change often)
    cache.set(cacheKey, parameters, 300);

    res.json(parameters);
  } catch (error) {
    console.error('Error fetching contract parameters:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual cache invalidation
app.get('/api/invalidate-cache', (req, res) => {
  try {
    const keys = cache.keys();
    const count = keys.length;
    cache.flushAll();
    console.log(`Cache invalidated: ${count} keys cleared`);
    res.json({ success: true, clearedKeys: count });
  } catch (error) {
    console.error('Error invalidating cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket handler for connections
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');

  // Handle messages from client
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      // Register client with wallet address
      if (data.type === 'register' && data.address) {
        connectedClients.set(data.address.toLowerCase(), ws);
        console.log(`Client registered with address: ${data.address}`);

        // Send registration confirmation
        ws.send(JSON.stringify({
          type: 'registered',
          success: true,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  // Handle connection closing
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
    // Remove client from Map by value
    for (const [address, client] of connectedClients.entries()) {
      if (client === ws) {
        connectedClients.delete(address);
        console.log(`Removed client with address: ${address}`);
        break;
      }
    }
  });
});

// Subscribe to contract events
if (contract) {
  // Error handling wrapper for event callbacks
  const safeEventHandler = (callback) => {
    return async (...args) => {
      try {
        await callback(...args);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    };
  };

  contract.on('MessageSent', safeEventHandler(async (messageId, sender, content, timestamp) => {
    console.log(`New message from ${sender}: ${content}`);

    // Invalidate feed caches
    const cacheKeys = cache.keys();
    cacheKeys.forEach(key => {
      if (key.startsWith('feed-') || key.startsWith('latest-')) {
        cache.del(key);
      }
    });

    try {
      // Get nickname for the sender
      const [nickname, avatarCode, isActive] = await contract.getUserProfile(sender);

      // Send notification to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify({
            type: 'newMessage',
            messageId: messageId.toString(),
            sender,
            nickname,
            content,
            timestamp: timestamp.toString()
          }));
        }
      });
    } catch (error) {
      console.error('Error processing MessageSent event:', error);
    }
  }));

  contract.on('ReplyMessageSent', safeEventHandler(async (messageId, sender, replyToMessageId, timestamp) => {
    console.log(`New reply from ${sender} to message ${replyToMessageId}`);

    // Clear all potential caches for this message
    const repliesCacheKey = `replies-${replyToMessageId}`;
    cache.del(repliesCacheKey);

    // Clear feed caches too
    cache.keys().forEach(key => {
      if (key.startsWith('feed-') || key.startsWith('feed-with-replies-')) {
        cache.del(key);
      }
    });

    // Invalidate specific reply cache and feeds
    cache.del(`replies-${replyToMessageId}`);

    // Invalidate feed caches
    cache.keys().forEach(key => {
      if (key.startsWith('feed-') || key.startsWith('feed-with-replies-') || key === `replies-${replyToMessageId}`) {
        cache.del(key);
      }
    });

    try {
      // Get nickname and content for the message
      const [nickname, avatarCode, isActive] = await contract.getUserProfile(sender);
      const message = await contract.getMessage(messageId);

      // Send notification to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify({
            type: 'newReply',
            messageId: messageId.toString(),
            sender,
            nickname,
            content: message ? message.content : '',
            replyToMessageId: replyToMessageId.toString(),
            timestamp: timestamp.toString()
          }));
        }
      });

      // Send specific notification to the original message author
      const originalMessage = await contract.getMessage(replyToMessageId);
      if (originalMessage && originalMessage.sender) {
        const targetClient = connectedClients.get(originalMessage.sender.toLowerCase());
        if (targetClient && targetClient.readyState === 1) {
          targetClient.send(JSON.stringify({
            type: 'replyToYourMessage',
            messageId: messageId.toString(),
            sender,
            nickname,
            content: message ? message.content : '',
            replyToMessageId: replyToMessageId.toString(),
            timestamp: timestamp.toString()
          }));
        }
      }
    } catch (error) {
      console.error('Error processing ReplyMessageSent event:', error);
    }
  }));

  contract.on('ProfileUpdated', safeEventHandler((user, nickname, avatarCode) => {
    console.log(`Profile updated for ${user}: ${nickname}`);

    // Invalidate profile cache
    cache.del(`profile-${user}`);
    cache.del(`nickname-${nickname}`);

    // Invalidate feed caches that might show this user's messages
    cache.keys().forEach(key => {
      if (key.startsWith('feed-') || key.startsWith('sender-')) {
        cache.del(key);
      }
    });

    // Send notification to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'profileUpdated',
          user,
          nickname,
          avatarCode
        }));
      }
    });
  }));

  contract.on('ProfileDeactivated', safeEventHandler((user) => {
    console.log(`Profile deactivated for ${user}`);

    // Invalidate profile cache
    cache.del(`profile-${user}`);

    // Send notification to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'profileDeactivated',
          user
        }));
      }
    });
  }));

  contract.on('MessageDeleted', safeEventHandler((messageId, sender) => {
    console.log(`Message ${messageId} deleted by ${sender}`);

    // Invalidate relevant caches
    cache.keys().forEach(key => {
      if (key.startsWith('feed-') || key === `replies-${messageId}` || key === `original-${messageId}`) {
        cache.del(key);
      }
    });

    // Notify all clients
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'messageDeleted',
          messageId: messageId.toString(),
          sender
        }));
      }
    });
  }));

  contract.on('OldMessagesDeleted', safeEventHandler((count) => {
    console.log(`${count} old messages deleted`);

    // Invalidate all feed and reply caches
    cache.keys().forEach(key => {
      if (key.startsWith('feed-') || key.startsWith('replies-') || key.startsWith('latest-')) {
        cache.del(key);
      }
    });

    // Notify all clients
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'oldMessagesDeleted',
          count: count.toString()
        }));
      }
    });
  }));

  contract.on('ParameterUpdated', safeEventHandler((paramName, newValue) => {
    console.log(`Contract parameter updated: ${paramName} = ${newValue}`);

    // Invalidate parameters cache
    cache.del('contract-parameters');

    // Send notification to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'parameterUpdated',
          paramName,
          newValue: newValue.toString()
        }));
      }
    });
  }));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    connections: wss.clients.size,
    cacheSize: cache.keys().length,
    contractConnected: !!contract
  });
});

// Clear message ID map periodically to prevent memory leaks
setInterval(() => {
  console.log(`Clearing message ID map (had ${messageIdMap.size} entries)`);
  messageIdMap.clear();
}, 3600000); // Clear every hour

// Handle all other routes with SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log('Shutting down gracefully...');

  // Close WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');

    // Close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  // Force quit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Connected to RPC: ${RPC_URL}`);
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
});