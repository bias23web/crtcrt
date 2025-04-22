// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/ReactiveTwitter.sol";

contract ReactiveTwitterTest is Test {
    ReactiveTwitter twitter;
    address owner = address(0xCAFE);
    address user1 = address(0x1);
    address user2 = address(0x2);
    address user3 = address(0x3);

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

    function setUp() public {
        vm.prank(owner);
        twitter = new ReactiveTwitter();
        vm.label(owner, "Owner");
        vm.label(user1, "User 1");
        vm.label(user2, "User 2");
        vm.label(user3, "User 3");

        // Set time at the beginning of testing
        vm.warp(1000);
    }

    // Helper function to create a user profile
    function _createProfile(
        address user,
        string memory nickname,
        string memory avatarCode
    ) internal {
        vm.prank(user);
        twitter.updateProfile(nickname, avatarCode);
    }

    // Helper to ensure cooldown
    function _ensureCooldownPassed() internal {
        vm.warp(block.timestamp + 61);
    }

    // Helper to post multiple messages at once
    function _postMultipleMessages(
        address user,
        uint256 count,
        string memory baseContent
    ) internal {
        for (uint256 i = 0; i < count; i++) {
            vm.prank(user);
            twitter.postMessage(
                string(abi.encodePacked(baseContent, " ", vm.toString(i + 1)))
            );
            _ensureCooldownPassed();
        }
    }

    // Owner parameter tests
    function testOwnershipAndParameters() public {
        assertEq(twitter.getOwner(), owner);

        // Owner can update parameters
        vm.prank(owner);
        twitter.updateParameters(500, 30, 30, 400);

        (
            uint256 maxMessageLength,
            uint256 messageCooldown,
            uint256 maxReturnCount,
            uint256 maxActiveMessages
        ) = twitter.getParameters();

        assertEq(maxMessageLength, 500);
        assertEq(messageCooldown, 30);
        assertEq(maxReturnCount, 30);
        assertEq(maxActiveMessages, 400);

        // Transfer ownership
        vm.prank(owner);
        twitter.transferOwnership(user1);
        assertEq(twitter.getOwner(), user1);

        // New owner can update parameters
        vm.prank(user1);
        twitter.updateParameters(600, 40, 40, 300);

        (
            maxMessageLength,
            messageCooldown,
            maxReturnCount,
            maxActiveMessages
        ) = twitter.getParameters();

        assertEq(maxMessageLength, 600);
        assertEq(messageCooldown, 40);
        assertEq(maxReturnCount, 40);
        assertEq(maxActiveMessages, 300);

        // Old owner cannot update parameters
        vm.prank(owner);
        vm.expectRevert("Only owner can call this function");
        twitter.updateParameters(400, 20, 20, 200);
    }

    // Profile creation and updates tests
    function testProfileCreation() public {
        vm.prank(user1);
        vm.expectEmit(true, true, true, true);
        emit ProfileUpdated(user1, "alice", "avatar1");
        twitter.updateProfile("alice", "avatar1");

        (string memory nickname, string memory avatarCode, ) = twitter
            .getUserProfile(user1);
        assertEq(nickname, "alice");
        assertEq(avatarCode, "avatar1");

        assertEq(twitter.getAddressByNickname("alice"), user1);
    }

    function testProfileUpdate() public {
        _createProfile(user1, "alice", "avatar1");

        vm.prank(user1);
        vm.expectEmit(true, true, true, true);
        emit ProfileUpdated(user1, "alice_new", "avatar2");
        twitter.updateProfile("alice_new", "avatar2");

        (string memory nickname, string memory avatarCode, ) = twitter
            .getUserProfile(user1);
        assertEq(nickname, "alice_new");
        assertEq(avatarCode, "avatar2");

        // Check old nickname is no longer linked to user
        assertEq(twitter.getAddressByNickname("alice"), address(0));
        assertEq(twitter.getAddressByNickname("alice_new"), user1);
    }

    function testAvatarUpdate() public {
        _createProfile(user1, "alice", "avatar1");

        vm.prank(user1);
        vm.expectEmit(true, true, true, true);
        emit ProfileUpdated(user1, "alice", "avatar_new");
        twitter.updateAvatar("avatar_new");

        (string memory nickname, string memory avatarCode, ) = twitter
            .getUserProfile(user1);
        assertEq(nickname, "alice");
        assertEq(avatarCode, "avatar_new");
    }

    function testProfileDeactivation() public {
        _createProfile(user1, "alice", "avatar1");

        vm.prank(user1);
        vm.expectEmit(true, true, true, true);
        emit ProfileDeactivated(user1);
        twitter.deactivateProfile();

        (
            string memory nickname,
            string memory avatarCode,
            bool isActive
        ) = twitter.getUserProfile(user1);
        assertEq(nickname, "alice");
        assertEq(avatarCode, "avatar1");
        assertFalse(isActive);

        // Verify that nickname has been freed
        assertEq(twitter.getAddressByNickname("alice"), address(0));
    }

    function testCannotUseExistingNickname() public {
        _createProfile(user1, "alice", "avatar1");

        vm.prank(user2);
        vm.expectRevert("Nickname already taken");
        twitter.updateProfile("alice", "avatar2");
    }

    function testNicknameValidation() public {
        vm.prank(user1);
        vm.expectRevert("Nickname cannot be empty");
        twitter.updateProfile("", "avatar1");

        string memory longNickname = new string(33); // 33 characters
        vm.prank(user1);
        vm.expectRevert("Nickname too long");
        twitter.updateProfile(longNickname, "avatar1");

        // Test for invalid characters
        vm.prank(user1);
        vm.expectRevert("Nickname contains invalid characters");
        twitter.updateProfile("user<script>", "avatar1");

        vm.prank(user1);
        vm.expectRevert("Nickname contains invalid characters");
        twitter.updateProfile("user@email.com", "avatar1");
    }

    function testCannotUpdateAvatarWithoutProfile() public {
        vm.prank(user1);
        vm.expectRevert("Set nickname first");
        twitter.updateAvatar("avatar1");
    }

    function testCannotDeactivateNonExistentProfile() public {
        vm.prank(user1);
        vm.expectRevert("Profile not found");
        twitter.deactivateProfile();
    }

    // Check active messages counter
    function testActiveMessagesCounter() public {
        _createProfile(user1, "alice", "avatar1");

        // Initially there are no active messages
        assertEq(twitter.getTotalActiveMessages(), 0);

        // After publishing a message, the counter should increase
        vm.prank(user1);
        twitter.postMessage("Test message");
        assertEq(twitter.getTotalActiveMessages(), 1);

        // After deleting a message, the counter should decrease
        vm.prank(user1);
        twitter.markMessageAsDeleted(1);
        assertEq(twitter.getTotalActiveMessages(), 0);
    }

    // Test for automatic deletion of old messages
    function testAutoDeleteOldMessages() public {
        // Set a smaller limit for testing
        vm.prank(owner);
        twitter.updateParameters(783, 60, 50, 10);

        _createProfile(user1, "alice", "avatar1");

        // Publish 10 messages (filling the limit)
        _postMultipleMessages(user1, 10, "Regular message");

        // Check the counter
        assertEq(twitter.getTotalActiveMessages(), 10);

        // Publish one more message, which should trigger deletion of the oldest
        vm.prank(user1);
        vm.recordLogs(); // Start recording events
        twitter.postMessage("Trigger message");

        // Check that the number of active messages doesn't exceed the limit
        assertEq(twitter.getTotalActiveMessages(), 10);

        // Check that the OldMessagesDeleted event was generated
        Vm.Log[] memory entries = vm.getRecordedLogs();
        bool foundEvent = false;

        for (uint256 i = 0; i < entries.length; i++) {
            // OldMessagesDeleted event signature
            if (
                entries[i].topics[0] == keccak256("OldMessagesDeleted(uint256)")
            ) {
                foundEvent = true;
                break;
            }
        }

        assertTrue(foundEvent, "OldMessagesDeleted event should be emitted");

        // Check that the oldest message was deleted
        ReactiveTwitter.Message[] memory messages = twitter.getLatestMessages(
            10
        );

        bool oldestFound = false;
        for (uint256 i = 0; i < messages.length; i++) {
            if (
                keccak256(bytes(messages[i].content)) ==
                keccak256(bytes("Regular message 1"))
            ) {
                oldestFound = true;
                break;
            }
        }

        assertFalse(oldestFound, "Oldest message should have been deleted");
    }

    // Test for checking deletion of messages with replies (replies should not be deleted now)
    function testDeleteMessageWithReplies() public {
        _createProfile(user1, "alice", "avatar1");
        _createProfile(user2, "bob", "avatar2");

        // Create a main message
        vm.prank(user1);
        twitter.postMessage("Main message");
        _ensureCooldownPassed();

        // Create a reply to this message
        vm.prank(user2);
        twitter.replyToMessage(1, "Reply to main message");
        _ensureCooldownPassed();

        // Check that we have 2 active messages
        assertEq(twitter.getTotalActiveMessages(), 2);

        // Delete the main message
        vm.prank(user1);
        twitter.markMessageAsDeleted(1);

        // Check that only the main message is deleted, and the reply remains
        assertEq(twitter.getTotalActiveMessages(), 1);

        // Get replies to the deleted message
        ReactiveTwitter.Message[] memory replies = twitter.getRepliesForMessage(
            1
        );
        assertEq(replies.length, 1, "Reply should still be active");
        assertEq(replies[0].content, "Reply to main message");
    }

    // Test for a large number of messages and checking the limit
    function testMessageLimitWithManyMessages() public {
        // Increase the return message limit for this test
        vm.prank(owner);
        twitter.updateParameters(783, 60, 100, 50);

        _createProfile(user1, "alice", "avatar1");

        uint256 largeMessageCount = 60; // More than maxActiveMessages (50)
        console.log("Posting many messages...");

        // Publish many messages
        _postMultipleMessages(user1, largeMessageCount, "Bulk message");

        // Check that active messages don't exceed the limit
        assertEq(twitter.getTotalActiveMessages(), 50);

        // Check that the newest messages are available
        ReactiveTwitter.Message[] memory latestMessages = twitter
            .getLatestMessages(10);
        assertEq(latestMessages.length, 10);

        // Check that the last message is indeed the last published
        string memory expectedContent = string(
            abi.encodePacked("Bulk message ", vm.toString(largeMessageCount))
        );
        assertEq(latestMessages[0].content, expectedContent);

        // Check that the first message is deleted (it's not in the latest messages)
        ReactiveTwitter.Message[] memory allMessages = twitter
            .getLatestMessages(50);

        bool firstMessageFound = false;
        for (uint256 i = 0; i < allMessages.length; i++) {
            if (
                keccak256(bytes(allMessages[i].content)) ==
                keccak256(bytes("Bulk message 1"))
            ) {
                firstMessageFound = true;
                break;
            }
        }

        assertFalse(
            firstMessageFound,
            "First message should have been deleted"
        );
    }

    // Test for message deletion by administrator
    function testAdminDeletesMessage() public {
        _createProfile(user1, "alice", "avatar1");

        // User publishes a message
        vm.prank(user1);
        twitter.postMessage("User message");

        // Administrator can delete any message
        vm.prank(owner);
        twitter.markMessageAsDeleted(1);

        // Check that the message is deleted
        assertEq(twitter.getTotalActiveMessages(), 0);
    }

    // Test for lowering the limit by administrator
    function testLowerMaxMessagesLimit() public {
        _createProfile(user1, "alice", "avatar1");

        // Publish 20 messages
        _postMultipleMessages(user1, 20, "Test message");

        // Check the number of active messages
        assertEq(twitter.getTotalActiveMessages(), 20);

        // Administrator lowers the limit to 10
        vm.prank(owner);
        vm.recordLogs();
        twitter.updateParameters(783, 60, 50, 10);

        // Check that the number of active messages decreased to the new limit
        assertEq(twitter.getTotalActiveMessages(), 10);

        // Check that there was a deletion event
        Vm.Log[] memory entries = vm.getRecordedLogs();
        bool foundEvent = false;

        for (uint256 i = 0; i < entries.length; i++) {
            if (
                entries[i].topics[0] == keccak256("OldMessagesDeleted(uint256)")
            ) {
                foundEvent = true;
                break;
            }
        }

        assertTrue(foundEvent, "OldMessagesDeleted event should be emitted");
    }

    // Test for creating a profile with invalid characters
    function testNicknameWithInvalidCharacters() public {
        // Nickname with HTML tags
        vm.prank(user1);
        vm.expectRevert("Nickname contains invalid characters");
        twitter.updateProfile("<script>alert('xss')</script>", "avatar1");

        // Nickname with special characters
        vm.prank(user1);
        vm.expectRevert("Nickname contains invalid characters");
        twitter.updateProfile("user#$%", "avatar1");

        // Nickname with spaces
        vm.prank(user1);
        vm.expectRevert("Nickname contains invalid characters");
        twitter.updateProfile("user name", "avatar1");

        // Valid nickname with letters, numbers and underscore
        vm.prank(user1);
        twitter.updateProfile("user_name123", "avatar1");

        (string memory nickname, , ) = twitter.getUserProfile(user1);
        assertEq(nickname, "user_name123");
    }

    // Test for nickname release after profile deactivation
    function testNicknameReleaseAfterDeactivation() public {
        _createProfile(user1, "alice", "avatar1");

        // Check that the nickname is taken
        assertEq(twitter.getAddressByNickname("alice"), user1);

        // Deactivate the profile
        vm.prank(user1);
        twitter.deactivateProfile();

        // Check that the nickname is released
        assertEq(twitter.getAddressByNickname("alice"), address(0));

        // Another user can now use this nickname
        vm.prank(user2);
        twitter.updateProfile("alice", "avatar2");

        assertEq(twitter.getAddressByNickname("alice"), user2);
    }

    // Test for checking ability to post without a profile
    function testCannotPostWithoutProfile() public {
        // Try to publish a message without creating a profile
        vm.prank(user1);
        vm.expectRevert("Create a profile first");
        twitter.postMessage("This should fail");

        // Create a profile
        _createProfile(user1, "alice", "avatar1");

        // Now we can publish messages
        vm.prank(user1);
        twitter.postMessage("This should work");
        assertEq(twitter.getTotalActiveMessages(), 1);
    }

    // Test for checking the time limit between messages
    function testMessageCooldown() public {
        _createProfile(user1, "alice", "avatar1");

        // Publish the first message
        vm.prank(user1);
        twitter.postMessage("First message");

        // Try to publish a second message immediately (should fail)
        vm.prank(user1);
        vm.expectRevert("Please wait before posting again");
        twitter.postMessage("Second message too soon");

        // Wait half of the cooldown time
        vm.warp(block.timestamp + 30);

        // Still should not succeed
        vm.prank(user1);
        vm.expectRevert("Please wait before posting again");
        twitter.postMessage("Still too soon");

        // Wait for the full cooldown time
        vm.warp(block.timestamp + 31);

        // Now it should work
        vm.prank(user1);
        twitter.postMessage("This should work now");

        // Check that there are two active messages
        assertEq(twitter.getTotalActiveMessages(), 2);
    }

    // Test for checking message retrieval using the optimized getLatestMessages function
    function testOptimizedGetLatestMessages() public {
        _createProfile(user1, "alice", "avatar1");

        // Publish 5 messages
        _postMultipleMessages(user1, 5, "Test message");

        // Get the latest 3 messages
        ReactiveTwitter.Message[] memory messages = twitter.getLatestMessages(
            3
        );

        // Check that we got 3 messages
        assertEq(messages.length, 3);

        // Check that the messages are in the correct order (from newest to oldest)
        assertEq(messages[0].content, "Test message 5");
        assertEq(messages[1].content, "Test message 4");
        assertEq(messages[2].content, "Test message 3");
    }

    // Test for checking maximum message length
    function testMessageLengthLimit() public {
        _createProfile(user1, "alice", "avatar1");

        // Get the current maxMessageLength value from the contract
        (uint256 maxLength, , , ) = twitter.getParameters();

        // Create a string slightly shorter than the maximum length
        bytes memory validBytes = new bytes(maxLength - 5);
        for (uint i = 0; i < validBytes.length; i++) {
            validBytes[i] = 0x61; // ASCII code for 'a'
        }
        string memory validContent = string(validBytes);

        // Check that the length matches expectations
        require(
            bytes(validContent).length <= maxLength,
            "Valid message too long"
        );

        // Should send successfully
        vm.prank(user1);
        twitter.postMessage(validContent);

        // Create a string guaranteed to be longer than the maximum length
        bytes memory tooLongBytes = new bytes(maxLength + 5);
        for (uint i = 0; i < tooLongBytes.length; i++) {
            tooLongBytes[i] = 0x61; // ASCII code for 'a'
        }
        string memory tooLongContent = string(tooLongBytes);

        // Check that the length actually exceeds the maximum
        require(
            bytes(tooLongContent).length > maxLength,
            "Length not exceeded"
        );

        // Should cause an error
        vm.prank(user1);
        vm.expectRevert("Message too long");
        twitter.postMessage(tooLongContent);
    }

    // Test for checking getting replies for a non-existent message
    function testGetRepliesForNonExistentMessage() public {
        _createProfile(user1, "alice", "avatar1");

        // Try to get replies to a non-existent message
        vm.expectRevert("Message does not exist");
        twitter.getRepliesForMessage(999);
    }

    // Test for pagination functionality
    function testPagination() public {
        _createProfile(user1, "alice", "avatar1");

        // Publish 25 messages
        _postMultipleMessages(user1, 25, "Pagination test");

        // Get the first page (10 messages)
        ReactiveTwitter.Message[] memory page1 = twitter
            .getMessagesWithPagination(0, 10);
        assertEq(page1.length, 10);
        assertEq(page1[0].content, "Pagination test 25");
        assertEq(page1[9].content, "Pagination test 16");

        // Get the second page (10 messages)
        ReactiveTwitter.Message[] memory page2 = twitter
            .getMessagesWithPagination(1, 10);
        assertEq(page2.length, 10);
        assertEq(page2[0].content, "Pagination test 15");
        assertEq(page2[9].content, "Pagination test 6");

        // Get the third page (5 messages)
        ReactiveTwitter.Message[] memory page3 = twitter
            .getMessagesWithPagination(2, 10);
        assertEq(page3.length, 5);
        assertEq(page3[0].content, "Pagination test 5");
        assertEq(page3[4].content, "Pagination test 1");

        // Try to get a non-existent page
        ReactiveTwitter.Message[] memory emptyPage = twitter
            .getMessagesWithPagination(3, 10);
        assertEq(emptyPage.length, 0);
    }

    // Test for getting messages by period
    function testGetMessagesByPeriod() public {
        _createProfile(user1, "alice", "avatar1");

        // Publish 120 messages to cover more than one period
        _postMultipleMessages(user1, 120, "Period message");

        // Get messages from the first period (approximately period 1)
        ReactiveTwitter.Message[] memory periodMessages = twitter
            .getMessagesByPeriod(1);
        assertGt(periodMessages.length, 0, "Should have messages in period 1");

        // Try to get messages from a non-existent period
        vm.expectRevert("Period does not exist");
        twitter.getMessagesByPeriod(999);
    }

    // Test for getting messages from a specific sender
    function testGetMessagesBySender() public {
        _createProfile(user1, "alice", "avatar1");
        _createProfile(user2, "bob", "avatar2");

        // Publish messages from different users
        _postMultipleMessages(user1, 5, "Alice message");
        _postMultipleMessages(user2, 3, "Bob message");

        // Get messages from the first user
        ReactiveTwitter.Message[] memory user1Messages = twitter
            .getMessagesBySender(user1);
        assertEq(user1Messages.length, 5);
        for (uint i = 0; i < user1Messages.length; i++) {
            assertTrue(
                keccak256(bytes(user1Messages[i].nickname)) ==
                    keccak256(bytes("alice"))
            );
        }

        // Get messages from the second user
        ReactiveTwitter.Message[] memory user2Messages = twitter
            .getMessagesBySender(user2);
        assertEq(user2Messages.length, 3);
        for (uint i = 0; i < user2Messages.length; i++) {
            assertTrue(
                keccak256(bytes(user2Messages[i].nickname)) ==
                    keccak256(bytes("bob"))
            );
        }
    }

    // Test for getting the original message for a reply
    function testGetOriginalMessage() public {
        _createProfile(user1, "alice", "avatar1");
        _createProfile(user2, "bob", "avatar2");

        // Publish the main message
        vm.prank(user1);
        twitter.postMessage("Original message");
        _ensureCooldownPassed();

        // Publish a reply
        vm.prank(user2);
        twitter.replyToMessage(1, "Reply message");

        // Get the original message by the reply ID
        ReactiveTwitter.Message memory originalMessage = twitter
            .getOriginalMessage(2);
        assertEq(originalMessage.content, "Original message");
        assertEq(originalMessage.sender, user1);

        // Try to get the original message for a regular message (not a reply)
        vm.expectRevert("Not a reply message");
        twitter.getOriginalMessage(1);
    }

    // Test for validating incorrect parameters in functions with pagination
    function testInvalidPaginationParameters() public {
        _createProfile(user1, "alice", "avatar1");

        // Test too large page size
        vm.expectRevert("Page size too large");
        twitter.getMessagesWithPagination(0, 100);

        // Test zero page size
        vm.expectRevert("Page size must be greater than 0");
        twitter.getMessagesWithPagination(0, 0);
    }

    // Test for working with a large number of replies to one message
    function testManyRepliesToOneMessage() public {
        _createProfile(user1, "alice", "avatar1");
        _createProfile(user2, "bob", "avatar2");

        // Publish a main message
        vm.prank(user1);
        twitter.postMessage("Popular message");
        _ensureCooldownPassed();

        // Create many replies to this message
        uint256 replyCount = 20;
        for (uint i = 0; i < replyCount; i++) {
            vm.prank(user2);
            twitter.replyToMessage(
                1,
                string(abi.encodePacked("Reply #", vm.toString(i + 1)))
            );
            _ensureCooldownPassed();
        }

        // Check that all replies are received
        ReactiveTwitter.Message[] memory replies = twitter.getRepliesForMessage(
            1
        );
        assertEq(replies.length, replyCount);

        // Check that the last reply is correct
        bool foundLastReply = false;
        for (uint i = 0; i < replies.length; i++) {
            if (
                keccak256(bytes(replies[i].content)) ==
                keccak256(
                    bytes(
                        string(
                            abi.encodePacked("Reply #", vm.toString(replyCount))
                        )
                    )
                )
            ) {
                foundLastReply = true;
                break;
            }
        }
        assertTrue(foundLastReply, "Last reply should be found");
    }

    // Test for deleting a message that has many replies
    function testDeleteMessageWithManyReplies() public {
        _createProfile(user1, "alice", "avatar1");
        _createProfile(user2, "bob", "avatar2");

        // Publish a main message
        vm.prank(user1);
        twitter.postMessage("Message with replies");
        _ensureCooldownPassed();

        // Create 10 replies
        for (uint i = 0; i < 10; i++) {
            vm.prank(user2);
            twitter.replyToMessage(
                1,
                string(abi.encodePacked("Reply #", vm.toString(i + 1)))
            );
            _ensureCooldownPassed();
        }

        // Delete the main message
        vm.prank(user1);
        twitter.markMessageAsDeleted(1);

        // Check that the main message is marked as deleted
        ReactiveTwitter.Message[] memory mainMessages = twitter
            .getLatestMessages(10);
        bool foundMainMessage = false;
        for (uint i = 0; i < mainMessages.length; i++) {
            if (
                keccak256(bytes(mainMessages[i].content)) ==
                keccak256(bytes("Message with replies"))
            ) {
                foundMainMessage = true;
                break;
            }
        }
        assertFalse(foundMainMessage, "Main message should be deleted");

        // Check that the replies are still available
        ReactiveTwitter.Message[] memory replies = twitter.getRepliesForMessage(
            1
        );
        assertEq(replies.length, 10, "All replies should still be available");
    }

    // Test for sequential sending of messages and replies
    function testSequentialMessagesAndReplies() public {
        _createProfile(user1, "alice", "avatar1");
        _createProfile(user2, "bob", "avatar2");
        _createProfile(user3, "charlie", "avatar3");

        // User 1 sends a message
        vm.prank(user1);
        twitter.postMessage("Message from Alice");
        _ensureCooldownPassed();

        // User 2 replies to message 1
        vm.prank(user2);
        twitter.replyToMessage(1, "Bob replies to Alice");
        _ensureCooldownPassed();

        // User 3 replies to message 1
        vm.prank(user3);
        twitter.replyToMessage(1, "Charlie also replies to Alice");
        _ensureCooldownPassed();

        // User 1 replies to user 2's reply
        vm.prank(user1);
        twitter.replyToMessage(2, "Alice replies to Bob");
        _ensureCooldownPassed();

        // Check number of replies to message 1
        ReactiveTwitter.Message[] memory repliesTo1 = twitter
            .getRepliesForMessage(1);
        assertEq(
            repliesTo1.length,
            2,
            "Original message should have 2 direct replies"
        );

        // Check number of replies to message 2
        ReactiveTwitter.Message[] memory repliesTo2 = twitter
            .getRepliesForMessage(2);
        assertEq(
            repliesTo2.length,
            1,
            "Bob's reply should have 1 reply from Alice"
        );

        // Check that the original message for reply 4 is message 2
        ReactiveTwitter.Message memory originalFor4 = twitter
            .getOriginalMessage(4);
        assertEq(
            originalFor4.sender,
            user2,
            "Original message for message 4 should be from user2"
        );
        assertEq(
            originalFor4.content,
            "Bob replies to Alice",
            "Content should match"
        );
    }

    // Test for handling HTML and special characters in message content
    function testSpecialCharactersInMessageContent() public {
        _createProfile(user1, "alice", "avatar1");

        // Test with HTML tags
        vm.prank(user1);
        twitter.postMessage("<script>alert('test')</script>");
        _ensureCooldownPassed();

        // Test with emoji and special characters
        vm.prank(user1);
        twitter.postMessage(
            unicode"Test with emoji 😀 and special chars: &$#@!"
        );

        // Check that messages are stored correctly
        ReactiveTwitter.Message[] memory messages = twitter.getLatestMessages(
            2
        );
        assertEq(
            messages[0].content,
            unicode"Test with emoji 😀 and special chars: &$#@!"
        );
        assertEq(messages[1].content, "<script>alert('test')</script>");
    }

    // Test for message ID sequence when creating and deleting
    function testMessageIdsSequence() public {
        _createProfile(user1, "alice", "avatar1");

        // Create and delete messages
        vm.prank(user1);
        twitter.postMessage("Message 1");
        _ensureCooldownPassed();

        vm.prank(user1);
        twitter.postMessage("Message 2");
        _ensureCooldownPassed();

        vm.prank(user1);
        twitter.markMessageAsDeleted(1);
        _ensureCooldownPassed();

        vm.prank(user1);
        twitter.postMessage("Message 3");
        _ensureCooldownPassed();

        // Check total message count
        assertEq(twitter.getMessageCount(), 4); // 1 (dummy) + 3 created

        // Check active messages
        ReactiveTwitter.Message[] memory messages = twitter.getLatestMessages(
            10
        );
        assertEq(messages.length, 2); // Two active messages

        // Check that message IDs are sequential
        bool foundMessage2 = false;
        bool foundMessage3 = false;

        for (uint i = 0; i < messages.length; i++) {
            if (
                keccak256(bytes(messages[i].content)) ==
                keccak256(bytes("Message 2"))
            ) {
                foundMessage2 = true;
            }
            if (
                keccak256(bytes(messages[i].content)) ==
                keccak256(bytes("Message 3"))
            ) {
                foundMessage3 = true;
            }
        }

        assertTrue(foundMessage2, "Message 2 should be found");
        assertTrue(foundMessage3, "Message 3 should be found");
    }

    // Test for message fetch limit
    function testMessageFetchLimit() public {
        _createProfile(user1, "alice", "avatar1");

        // Publish 60 messages
        _postMultipleMessages(user1, 60, "Limit test message");

        // Attempt to request more than maxReturnCount
        vm.expectRevert("Too many messages requested");
        twitter.getLatestMessages(51); // More than maxReturnCount (50)

        // Request the maximum allowed number of messages
        ReactiveTwitter.Message[] memory messages = twitter.getLatestMessages(
            50
        );
        assertEq(messages.length, 50, "Should return maximum allowed messages");
    }

    // Test for the getMessage method
    function testGetMessageById() public {
        _createProfile(user1, "alice", "avatar1");

        // Publish a message
        vm.prank(user1);
        twitter.postMessage("Test message for get by ID");
        _ensureCooldownPassed();

        // Get message by ID
        uint256 messageId = 1; // First message after the zero (dummy) message
        ReactiveTwitter.Message memory message = twitter.getMessage(messageId);

        // Check that the message is correct
        assertEq(message.sender, user1);
        assertEq(message.content, "Test message for get by ID");
        assertEq(message.nickname, "alice");
        assertFalse(message.isDeleted);

        // Check that requesting a non-existent message causes an error
        vm.expectRevert("Message does not exist");
        twitter.getMessage(999);
    }

    // Test for checking message deletion and getting it by ID
    function testGetDeletedMessage() public {
        _createProfile(user1, "alice", "avatar1");

        // Publish a message
        vm.prank(user1);
        twitter.postMessage("Message to be deleted");
        _ensureCooldownPassed();

        // Delete the message
        vm.prank(user1);
        twitter.markMessageAsDeleted(1);

        // Get the deleted message by ID - it should be marked as deleted
        ReactiveTwitter.Message memory deletedMessage = twitter.getMessage(1);
        assertTrue(deletedMessage.isDeleted);
        assertEq(deletedMessage.content, "Message to be deleted");
    }

    // Test for message identification when deleting
    function testMessageIdentificationForDeletion() public {
        _createProfile(user1, "alice", "avatar1");

        // Publish several messages
        vm.prank(user1);
        twitter.postMessage("First message");
        _ensureCooldownPassed();

        vm.prank(user1);
        twitter.postMessage("Second message");
        _ensureCooldownPassed();

        vm.prank(user1);
        twitter.postMessage("Third message");
        _ensureCooldownPassed();

        // Check ID and content of each message
        ReactiveTwitter.Message memory message1 = twitter.getMessage(1);
        ReactiveTwitter.Message memory message2 = twitter.getMessage(2);
        ReactiveTwitter.Message memory message3 = twitter.getMessage(3);

        assertEq(message1.content, "First message");
        assertEq(message2.content, "Second message");
        assertEq(message3.content, "Third message");

        // Delete the second message
        vm.prank(user1);
        twitter.markMessageAsDeleted(2);

        // Check that only the second message is marked as deleted
        message1 = twitter.getMessage(1);
        message2 = twitter.getMessage(2);
        message3 = twitter.getMessage(3);

        assertFalse(message1.isDeleted);
        assertTrue(message2.isDeleted);
        assertFalse(message3.isDeleted);

        // Check that getLatestMessages doesn't return the deleted message
        ReactiveTwitter.Message[] memory latestMessages = twitter
            .getLatestMessages(10);

        // Should be only 2 active messages
        assertEq(latestMessages.length, 2);

        // Check that the second message is not in the result
        bool foundDeletedMessage = false;
        for (uint i = 0; i < latestMessages.length; i++) {
            if (
                keccak256(bytes(latestMessages[i].content)) ==
                keccak256(bytes("Second message"))
            ) {
                foundDeletedMessage = true;
                break;
            }
        }

        assertFalse(
            foundDeletedMessage,
            "Deleted message should not be in getLatestMessages"
        );
    }
}