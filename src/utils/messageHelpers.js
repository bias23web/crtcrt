// src/utils/messageHelpers.js

/**
 * Safely converts BigNumber to Number
 * @param {any} value - Value to convert
 * @return {number} Converted number
 */
export const safeToNumber = (value) => {
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

/**
 * Scrolls to a specific message element with offset
 * @param {string|number} messageId - ID of the message to scroll to
 * @param {number} offset - Offset from the top in pixels
 */
export const scrollToMessage = (messageId, offset = 100) => {
    const messageSelector = `#message-${messageId}`;
    const messageElement = document.querySelector(messageSelector);

    if (messageElement) {
        window.scrollTo({
            behavior: 'smooth',
            top:
                messageElement.getBoundingClientRect().top -
                document.body.getBoundingClientRect().top -
                offset,
        });

        // Highlight the message temporarily
        messageElement.classList.add('highlight-message');
        setTimeout(() => {
            messageElement.classList.remove('highlight-message');
        }, 3000); // Highlight for 3 seconds
    } else {
        console.log(`Message with ID ${messageId} not found in current view`);
    }
};

/**
 * Calculate posting rate based on message timestamps
 * @param {Array<number>} timestamps - Array of message timestamps
 * @return {string} Formatted posting rate
 */
export const calculatePostingRate = (timestamps) => {
    if (!timestamps || timestamps.length < 2) return "N/A";

    // Sort timestamps in ascending order (oldest to newest)
    const sortedTimestamps = [...timestamps].sort((a, b) => a - b);

    // Get intervals between messages
    const intervalTimes = [];
    for (let i = 1; i < sortedTimestamps.length; i++) {
        const diff = sortedTimestamps[i] - sortedTimestamps[i - 1];
        // Check that difference is positive and reasonable (less than 24 hours)
        if (diff > 0 && diff < 86400000) {
            intervalTimes.push(diff);
        }
    }

    if (intervalTimes.length === 0) return "N/A";

    // Calculate average time in milliseconds
    const avgTimeMs = intervalTimes.reduce((sum, time) => sum + time, 0) / intervalTimes.length;

    // Format result
    if (avgTimeMs < 1000) {
        return `${avgTimeMs.toFixed(0)} ms`;
    } else if (avgTimeMs < 60000) {
        return `${(avgTimeMs / 1000).toFixed(1)} sec`;
    } else if (avgTimeMs < 3600000) {
        return `${(avgTimeMs / 60000).toFixed(1)} min`;
    } else {
        return `${(avgTimeMs / 3600000).toFixed(1)} hours`;
    }
};