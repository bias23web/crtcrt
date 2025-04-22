// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/reactive-lib/src/interfaces/IReactive.sol";
import "../lib/reactive-lib/src/abstract-base/AbstractReactive.sol";

contract ReactiveTwitter is IReactive, AbstractReactive {
    // Configurable parameters (can be changed by owner)
    uint256 private maxMessageLength = 768; // maximum message length
    uint256 private messageCooldown = 60; // 60 seconds between messages
    uint256 private maxReturnCount = 50; // maximum number of messages to return
    uint256 private maxActiveMessages = 500; // maximum number of active messages

    // Constant parameters
    uint256 private constant PERIOD_SIZE = 100; // number of messages in one period
    uint256 private constant MAX_QUEUE_SIZE = 500; // Maximum queue size for deletion operation

    // Message structure
    struct Message {
        address sender;
        string content;
        uint256 timestamp;
        string nickname;
        uint256 replyToMessageId; // ID of the message this is replying to (0 if not a reply)
        bool isDeleted; // Flag to mark message as "deleted"
    }

    // User profile structure
    struct UserProfile {
        string nickname;
        string avatarCode; // User's avatar code
        bool isActive;
        uint256 lastNicknameUpdate; // Timestamp of the last nickname update
    }

    // Admin/owner
    address private owner;

    // Improved storage structures
    mapping(uint256 => Message) private messages; // Direct access to messages by ID
    uint256 private messageCount; // Counter for message IDs

    // Period tracking - optimized
    mapping(uint256 => uint256[]) private messageIdsByPeriod; // period -> array of message IDs
    mapping(uint256 => uint256) private activeMessageCountByPeriod; // Count of non-deleted messages per period
    uint256[] private periods; // list of existing periods
    mapping(uint256 => bool) private periodExists; // check if period exists

    // Messages by sender - with active count
    mapping(address => uint256[]) private senderToMessageIds;
    mapping(address => uint256) private activeSenderMessageCount; // Count of non-deleted messages per sender

    // Replies to messages
    mapping(uint256 => uint256[]) private messageReplies; // original message ID -> array of reply message IDs
    mapping(uint256 => uint256) private activeReplyCount; // Count of non-deleted replies per message

    // Mapping of nicknames to addresses
    mapping(string => address) private nicknameToAddress;

    // Mapping of addresses to user profiles
    mapping(address => UserProfile) private addressToProfile;

    // Last message timestamp for spam protection
    mapping(address => uint256) private lastMessageTime;

    // Total active messages counter
    uint256 private totalActiveMessages;

    // Chronologically ordered message IDs for efficient deletion
    uint256[] private chronologicalMessageIds;
    mapping(uint256 => uint256) private messageIdToChronologicalIndex;

    // Events
    event MessageSent(
        uint256 indexed messageId,
        address indexed sender,
        string content,
        uint256 timestamp
    );

    event ReplyMessageSent(
        uint256 indexed messageId,
        address indexed sender,
        uint256 indexed replyToMessageId,
        uint256 timestamp
    );

    event ProfileUpdated(
        address indexed user,
        string nickname,
        string avatarCode
    );

    event ProfileDeactivated(address indexed user);

    event MessageDeleted(uint256 indexed messageId, address indexed sender);

    event OldMessagesDeleted(uint256 count);

    event ParameterUpdated(string paramName, uint256 newValue);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    /**
     * @dev Constructor with no parameters since we don't need external subscriptions
     */
    constructor() payable {
        owner = msg.sender;

        // Initialize with a dummy message at index 0
        // This ensures messageId 0 is reserved, so we can use 0 to indicate "not a reply"
        messages[0] = Message({
            sender: address(0),
            content: "",
            timestamp: block.timestamp,
            nickname: "",
            replyToMessageId: 0,
            isDeleted: true
        });

        // Add to period 0
        messageIdsByPeriod[0].push(0);
        periods.push(0);
        periodExists[0] = true;
        messageCount = 1;
        totalActiveMessages = 0; // Initialize counter

        // Add dummy message to chronological list
        chronologicalMessageIds.push(0);
        messageIdToChronologicalIndex[0] = 0;
    }

    /**
     * @dev Gets a message by its ID
     * @param messageId Message ID to retrieve
     * @return the message
     */
    function getMessage(uint256 messageId) external view returns (Message memory) {
        require(messageId < messageCount, "Message does not exist");
        return messages[messageId];
    }

    /**
     * @dev Updates configurable parameters
     * @param newMaxMessageLength New maximum message length
     * @param newMessageCooldown New message cooldown in seconds
     * @param newMaxReturnCount New maximum return count
     * @param newMaxActiveMessages New maximum active messages count
     */
    function updateParameters(
        uint256 newMaxMessageLength,
        uint256 newMessageCooldown,
        uint256 newMaxReturnCount,
        uint256 newMaxActiveMessages
    ) external onlyOwner {
        maxMessageLength = newMaxMessageLength;
        emit ParameterUpdated("maxMessageLength", newMaxMessageLength);

        messageCooldown = newMessageCooldown;
        emit ParameterUpdated("messageCooldown", newMessageCooldown);

        maxReturnCount = newMaxReturnCount;
        emit ParameterUpdated("maxReturnCount", newMaxReturnCount);

        maxActiveMessages = newMaxActiveMessages;
        emit ParameterUpdated("maxActiveMessages", newMaxActiveMessages);

        // If new limit is lower than current count, delete old messages
        if (totalActiveMessages > newMaxActiveMessages) {
            deleteOldestMessages(totalActiveMessages - newMaxActiveMessages);
        }
    }

    /**
     * @dev Transfers ownership to a new address
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        owner = newOwner;
    }

    /**
     * @dev Implementation of the react method to comply with IReactive interface
     * Empty implementation for Reactive Network requirements
     */
    function react(LogRecord calldata) external override vmOnly {
        // Empty implementation as we don't process external blockchain events
    }

    /**
     * @dev Validates that a nickname contains only allowed characters
     * @param nickname The nickname to validate
     * @return True if nickname is valid, false otherwise
     */
    function _validateNickname(
        string memory nickname
    ) private pure returns (bool) {
        bytes memory b = bytes(nickname);
        for (uint i; i < b.length; i++) {
            // Allow only letters, numbers, and underscore
            bytes1 char = b[i];
            if (
                !(char >= 0x30 && char <= 0x39) && // 0-9
                !(char >= 0x41 && char <= 0x5A) && // A-Z
                !(char >= 0x61 && char <= 0x7A) && // a-z
                !(char == 0x5F) // _
            ) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Sets nickname and avatar for the user
     * @param nickname Desired nickname
     * @param avatarCode User's avatar code
     */
    function updateProfile(
        string calldata nickname,
        string calldata avatarCode
    ) external {
        require(bytes(nickname).length > 0, "Nickname cannot be empty");
        require(bytes(nickname).length <= 32, "Nickname too long");
        require(
            _validateNickname(nickname),
            "Nickname contains invalid characters"
        );

        // Check if this nickname is used by another user
        address existingAddress = nicknameToAddress[nickname];
        if (existingAddress != address(0) && existingAddress != msg.sender) {
            revert("Nickname already taken");
        }

        // Clean up old nickname
        UserProfile storage userProfile = addressToProfile[msg.sender];
        if (bytes(userProfile.nickname).length > 0) {
            // Check if the nickname still belongs to this user
            if (nicknameToAddress[userProfile.nickname] == msg.sender) {
                delete nicknameToAddress[userProfile.nickname];
            }
        }

        // Update user profile
        userProfile.nickname = nickname;
        userProfile.avatarCode = avatarCode;
        userProfile.isActive = true;
        userProfile.lastNicknameUpdate = block.timestamp;

        // Link nickname with address
        nicknameToAddress[nickname] = msg.sender;

        emit ProfileUpdated(msg.sender, nickname, avatarCode);
    }

    /**
     * @dev Sets only avatar for the user
     * @param avatarCode User's avatar code
     */
    function updateAvatar(string calldata avatarCode) external {
        // Check that the user already has a profile
        require(
            bytes(addressToProfile[msg.sender].nickname).length > 0,
            "Set nickname first"
        );

        // Update avatar only
        addressToProfile[msg.sender].avatarCode = avatarCode;

        emit ProfileUpdated(
            msg.sender,
            addressToProfile[msg.sender].nickname,
            avatarCode
        );
    }

    /**
     * @dev Deactivates user profile and frees the nickname
     */
    function deactivateProfile() external {
        require(
            bytes(addressToProfile[msg.sender].nickname).length > 0,
            "Profile not found"
        );

        string memory currentNickname = addressToProfile[msg.sender].nickname;

        // Free the nickname only if it belongs to this user
        if (nicknameToAddress[currentNickname] == msg.sender) {
            delete nicknameToAddress[currentNickname];
        }

        addressToProfile[msg.sender].isActive = false;
        emit ProfileDeactivated(msg.sender);
    }

    /**
     * @dev Delete oldest messages to stay within the limit
     * @param count Number of messages to delete
     */
    function deleteOldestMessages(uint256 count) private {
        if (count == 0 || totalActiveMessages == 0) return;

        // Limit the count to avoid excessive gas usage
        uint256 deletedCount = 0;
        uint256 maxToDelete = count < totalActiveMessages
            ? count
            : totalActiveMessages;

        // We'll delete from oldest to newest using chronological array
        // Start from beginning of the array (oldest messages)
        for (
            uint256 i = 1;
            i < chronologicalMessageIds.length && deletedCount < maxToDelete;
            i++
        ) {
            uint256 messageId = chronologicalMessageIds[i];

            // Only delete main messages that aren't already deleted
            if (
                !messages[messageId].isDeleted &&
                messages[messageId].replyToMessageId == 0
            ) {
                _markMessageAsDeleted(messageId);
                deletedCount++;
            }

            // Check if we've deleted enough messages
            if (deletedCount >= maxToDelete) {
                break;
            }
        }

        if (deletedCount > 0) {
            emit OldMessagesDeleted(deletedCount);
        }
    }

    /**
     * @dev Marks a message as deleted without affecting replies
     * @param messageId Message ID to delete
     */
    function _markMessageAsDeleted(uint256 messageId) private {
        // Skip if already deleted
        if (messages[messageId].isDeleted) {
            return;
        }

        // Mark as deleted in main storage
        messages[messageId].isDeleted = true;

        // Update counters
        uint256 period = messageId / PERIOD_SIZE;
        if (periodExists[period]) {
            activeMessageCountByPeriod[period]--;
        }

        address sender = messages[messageId].sender;
        activeSenderMessageCount[sender]--;

        // If this is a reply, update the reply counter of the parent
        if (messages[messageId].replyToMessageId != 0) {
            activeReplyCount[messages[messageId].replyToMessageId]--;
        }

        // Decrement total active messages counter
        totalActiveMessages--;
    }

    /**
     * @dev Sends a public message (like a tweet)
     * @param content Message content
     */
    function postMessage(string calldata content) external {
        require(bytes(content).length > 0, "Message cannot be empty");
        require(bytes(content).length <= maxMessageLength, "Message too long");
        require(
            block.timestamp - lastMessageTime[msg.sender] >= messageCooldown,
            "Please wait before posting again"
        );
        require(
            bytes(addressToProfile[msg.sender].nickname).length > 0,
            "Create a profile first"
        );
        require(
            addressToProfile[msg.sender].isActive,
            "Profile is deactivated"
        );

        // Check if we need to delete old messages before adding a new one
        if (totalActiveMessages >= maxActiveMessages) {
            deleteOldestMessages(1);
        }

        uint256 messageId = messageCount;
        messageCount++; // Increment the counter

        // Calculate period based on total message count
        uint256 period = messageId / PERIOD_SIZE;

        // Create new message
        messages[messageId] = Message({
            sender: msg.sender,
            content: content,
            timestamp: block.timestamp,
            nickname: addressToProfile[msg.sender].nickname,
            replyToMessageId: 0, // not a reply
            isDeleted: false
        });

        // Add message to the corresponding period
        if (!periodExists[period]) {
            periods.push(period);
            periodExists[period] = true;
        }
        messageIdsByPeriod[period].push(messageId);
        activeMessageCountByPeriod[period]++;

        // Add message ID to the sender's message list
        senderToMessageIds[msg.sender].push(messageId);
        activeSenderMessageCount[msg.sender]++;

        // Add to chronological list for efficient deletion later
        chronologicalMessageIds.push(messageId);
        messageIdToChronologicalIndex[messageId] =
            chronologicalMessageIds.length -
            1;

        // Increment total active messages counter
        totalActiveMessages++;

        // Update last message timestamp
        lastMessageTime[msg.sender] = block.timestamp;

        emit MessageSent(messageId, msg.sender, content, block.timestamp);
    }

    /**
     * @dev Sends a reply to an existing message
     * @param replyToMessageId ID of the message being replied to
     * @param content Message content
     */
    function replyToMessage(
        uint256 replyToMessageId,
        string calldata content
    ) external {
        require(
            replyToMessageId < messageCount,
            "Original message does not exist"
        );
        require(bytes(content).length > 0, "Message cannot be empty");
        require(bytes(content).length <= maxMessageLength, "Message too long");
        require(
            block.timestamp - lastMessageTime[msg.sender] >= messageCooldown,
            "Please wait before posting again"
        );
        require(
            bytes(addressToProfile[msg.sender].nickname).length > 0,
            "Create a profile first"
        );
        require(
            addressToProfile[msg.sender].isActive,
            "Profile is deactivated"
        );

        // Check if we need to delete old messages before adding a new one
        if (totalActiveMessages >= maxActiveMessages) {
            deleteOldestMessages(1);
        }

        uint256 messageId = messageCount;
        messageCount++; // Increment the counter

        // Calculate period based on total message count
        uint256 period = messageId / PERIOD_SIZE;

        // Create new message
        messages[messageId] = Message({
            sender: msg.sender,
            content: content,
            timestamp: block.timestamp,
            nickname: addressToProfile[msg.sender].nickname,
            replyToMessageId: replyToMessageId,
            isDeleted: false
        });

        // Add message to the corresponding period
        if (!periodExists[period]) {
            periods.push(period);
            periodExists[period] = true;
        }
        messageIdsByPeriod[period].push(messageId);
        activeMessageCountByPeriod[period]++;

        // Add message ID to the sender's message list
        senderToMessageIds[msg.sender].push(messageId);
        activeSenderMessageCount[msg.sender]++;

        // Add this reply to the original message's replies list
        messageReplies[replyToMessageId].push(messageId);
        activeReplyCount[replyToMessageId]++;

        // Add to chronological list for efficient deletion later
        chronologicalMessageIds.push(messageId);
        messageIdToChronologicalIndex[messageId] =
            chronologicalMessageIds.length -
            1;

        // Increment total active messages counter
        totalActiveMessages++;

        // Update last message timestamp
        lastMessageTime[msg.sender] = block.timestamp;

        emit ReplyMessageSent(
            messageId,
            msg.sender,
            replyToMessageId,
            block.timestamp
        );
    }

    /**
     * @dev Mark message as deleted (soft delete)
     * @param messageId Message ID to delete
     */
    function markMessageAsDeleted(uint256 messageId) external {
        require(messageId < messageCount, "Message does not exist");
        require(
            messages[messageId].sender == msg.sender || msg.sender == owner,
            "Not authorized to delete this message"
        );
        require(!messages[messageId].isDeleted, "Message already deleted");

        // Use non-recursive function to mark only this message as deleted
        _markMessageAsDeleted(messageId);

        emit MessageDeleted(messageId, msg.sender);
    }

    /**
     * @dev Gets total number of active messages
     * @return count of active messages
     */
    function getTotalActiveMessages() public view returns (uint256) {
        return totalActiveMessages;
    }

    /**
     * @dev Gets the current owner address
     * @return address of current owner
     */
    function getOwner() public view returns (address) {
        return owner;
    }

    /**
     * @dev Gets current configuration parameters
     * @return _maxMessageLength Current maximum message length
     * @return _messageCooldown Current message cooldown in seconds
     * @return _maxReturnCount Current maximum return count
     * @return _maxActiveMessages Current maximum active messages
     */
    function getParameters()
        public
        view
        returns (
            uint256 _maxMessageLength,
            uint256 _messageCooldown,
            uint256 _maxReturnCount,
            uint256 _maxActiveMessages
        )
    {
        return (
            maxMessageLength,
            messageCooldown,
            maxReturnCount,
            maxActiveMessages
        );
    }

    /**
     * @dev Gets the latest N public messages (not replies)
     * @param count Number of messages to retrieve
     * @return array of messages
     */
    function getLatestMessages(
        uint256 count
    ) external view returns (Message[] memory) {
        require(count <= maxReturnCount, "Too many messages requested");

        uint256 resultCount = count < totalActiveMessages
            ? count
            : totalActiveMessages;

        Message[] memory result = new Message[](resultCount);
        if (resultCount == 0) return result;

        uint256 resultIndex = 0;

        // Start from the most recent message in the chronological array
        for (
            int256 i = int256(chronologicalMessageIds.length) - 1;
            i >= 0 && resultIndex < resultCount;
            i--
        ) {
            uint256 id = chronologicalMessageIds[uint256(i)];
            Message memory message = messages[id];

            // Include only public non-reply and non-deleted messages
            if (message.replyToMessageId == 0 && !message.isDeleted) {
                result[resultIndex] = message;
                resultIndex++;
            }
        }

        return result;
    }

    /**
     * @dev Gets replies to a specific message
     * @param messageId Original message ID
     * @return array of reply messages
     */
    function getRepliesForMessage(
        uint256 messageId
    ) external view returns (Message[] memory) {
        require(messageId < messageCount, "Message does not exist");

        uint256[] storage replies = messageReplies[messageId];
        uint256 activeReplies = activeReplyCount[messageId];

        Message[] memory result = new Message[](activeReplies);
        if (activeReplies == 0) return result;

        uint256 resultIndex = 0;

        for (
            uint256 i = 0;
            i < replies.length && resultIndex < activeReplies;
            i++
        ) {
            uint256 replyId = replies[i];
            if (!messages[replyId].isDeleted) {
                result[resultIndex] = messages[replyId];
                resultIndex++;
            }
        }

        return result;
    }

    /**
     * @dev Gets messages with pagination
     * @param page The page number (0-based)
     * @param pageSize Number of messages per page
     * @return array of messages
     */
    function getMessagesWithPagination(
        uint256 page,
        uint256 pageSize
    ) external view returns (Message[] memory) {
        require(pageSize > 0, "Page size must be greater than 0");
        require(pageSize <= maxReturnCount, "Page size too large");

        uint256 startIndex = page * pageSize;

        if (startIndex >= totalActiveMessages) {
            return new Message[](0);
        }

        uint256 resultSize = pageSize;
        if (startIndex + resultSize > totalActiveMessages) {
            resultSize = totalActiveMessages - startIndex;
        }

        Message[] memory result = new Message[](resultSize);

        uint256 activeCount = 0;
        uint256 resultIndex = 0;

        // Iterate through all messages in the chronological array
        for (
            int256 i = int256(chronologicalMessageIds.length) - 1;
            i >= 0 && resultIndex < resultSize;
            i--
        ) {
            uint256 id = chronologicalMessageIds[uint256(i)];
            Message memory message = messages[id];

            // Only count non-deleted, non-reply messages
            if (message.replyToMessageId == 0 && !message.isDeleted) {
                if (activeCount >= startIndex) {
                    result[resultIndex] = message;
                    resultIndex++;
                }
                activeCount++;
            }

            if (activeCount >= startIndex + resultSize) {
                break;
            }
        }

        return result;
    }

    /**
     * @dev Gets messages from a specific period
     * @param period The period number
     * @return array of messages
     */
    function getMessagesByPeriod(
        uint256 period
    ) external view returns (Message[] memory) {
        require(periodExists[period], "Period does not exist");

        uint256[] storage periodMessageIds = messageIdsByPeriod[period];
        uint256 activeCount = activeMessageCountByPeriod[period];

        Message[] memory result = new Message[](activeCount);
        if (activeCount == 0) return result;

        uint256 resultIndex = 0;

        for (
            uint256 i = 0;
            i < periodMessageIds.length && resultIndex < activeCount;
            i++
        ) {
            uint256 messageId = periodMessageIds[i];
            if (!messages[messageId].isDeleted) {
                result[resultIndex] = messages[messageId];
                resultIndex++;
            }
        }

        return result;
    }

    /**
     * @dev Gets messages from a specific sender
     * @param sender Sender address
     * @return array of messages
     */
    function getMessagesBySender(
        address sender
    ) external view returns (Message[] memory) {
        uint256[] storage messageIds = senderToMessageIds[sender];
        uint256 activeCount = activeSenderMessageCount[sender];

        Message[] memory result = new Message[](activeCount);
        if (activeCount == 0) return result;

        uint256 resultIndex = 0;

        for (
            uint256 i = 0;
            i < messageIds.length && resultIndex < activeCount;
            i++
        ) {
            uint256 messageId = messageIds[i];
            if (!messages[messageId].isDeleted) {
                result[resultIndex] = messages[messageId];
                resultIndex++;
            }
        }

        return result;
    }

    /**
     * @dev Gets a user profile
     * @param user User address
     * @return nickname User's nickname
     * @return avatarCode User's avatar code
     * @return isActive User's active status
     */
    function getUserProfile(
        address user
    )
        external
        view
        returns (
            string memory nickname,
            string memory avatarCode,
            bool isActive
        )
    {
        UserProfile memory profile = addressToProfile[user];
        return (profile.nickname, profile.avatarCode, profile.isActive);
    }

    /**
     * @dev Gets user address by nickname
     * @param nickname User's nickname
     * @return address
     */
    function getAddressByNickname(
        string calldata nickname
    ) external view returns (address) {
        return nicknameToAddress[nickname];
    }

    /**
     * @dev Gets total message count
     * @return number of messages
     */
    function getMessageCount() external view returns (uint256) {
        return messageCount;
    }

    /**
     * @dev Gets available periods
     * @return array of period numbers
     */
    function getAvailablePeriods() external view returns (uint256[] memory) {
        return periods;
    }

    /**
     * @dev Gets the original message that a reply is referring to
     * @param replyMessageId ID of the reply message
     * @return the original message
     */
    function getOriginalMessage(
        uint256 replyMessageId
    ) external view returns (Message memory) {
        require(replyMessageId < messageCount, "Message does not exist");

        Message memory replyMessage = messages[replyMessageId];
        require(replyMessage.replyToMessageId > 0, "Not a reply message");

        return messages[replyMessage.replyToMessageId];
    }

    // Use functions from parent without modifying them
    // Do not implement receive(), pay(), and coverDebt() as they are already
    // defined in the AbstractPayer contract
}