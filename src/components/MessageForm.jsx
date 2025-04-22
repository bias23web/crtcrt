// src/components/MessageForm.jsx
import { useState, useRef, useEffect } from 'react';
import Avatar from './Avatar';
import { useWeb3 } from '../contexts/Web3Context';

function MessageForm({ 
  onSendMessage, 
  disabled, 
  placeholder, 
  buttonText = 'Post',
  isReply = false 
}) {
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState([]);
  const { account, userProfile, contract, profileCache, lastMessageTimestamp } = useWeb3();
  const [maxLength, setMaxLength] = useState(783); // Default max length from contract
  const textareaRef = useRef(null);
  
  // Cooldown related states
  const [cooldownPeriod, setCooldownPeriod] = useState(60); // Default 60 seconds
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Constants for formatting
  const CHARS_PER_LINE = isReply ? 40 : 48;
  const MAX_LINES = isReply ? 16 : 16;

  // Get max message length and cooldown period from contract
  useEffect(() => {
    const getContractParameters = async () => {
      if (contract) {
        try {
          const params = await contract.getParameters();
          setMaxLength(params._maxMessageLength.toNumber());
          setCooldownPeriod(params._messageCooldown.toNumber());
        } catch (error) {
          console.error('Error getting contract parameters:', error);
        }
      }
    };

    getContractParameters();
  }, [contract]);

  // Calculate and update cooldown timer when lastMessageTimestamp changes
  useEffect(() => {
    if (!lastMessageTimestamp || lastMessageTimestamp === 0) return;

    const calculateRemainingTime = () => {
      const elapsedSeconds = Math.floor((Date.now() - lastMessageTimestamp) / 1000);
      const remaining = cooldownPeriod - elapsedSeconds;
      return Math.max(0, remaining);
    };
    
    // Initial calculation
    const initialRemaining = calculateRemainingTime();
    setTimeRemaining(initialRemaining);
    
    // Skip setting interval if no time remains
    if (initialRemaining <= 0) return;
    
    // Set up interval for countdown
    const interval = setInterval(() => {
      const remaining = calculateRemainingTime();
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [lastMessageTimestamp, cooldownPeriod]);

  // Update preview when message changes
  useEffect(() => {
    setPreview(generatePreview(message));
  }, [message]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Function to generate preview
  const generatePreview = (text) => {
    if (!text) return [];

    const lines = [];
    let currentLine = '';

    // Process each character
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // If we encounter a line break
      if (char === '\n') {
        // Add the current line to the array
        lines.push(currentLine);
        currentLine = '';
        continue;
      }

      // Add the character to the current line
      currentLine += char;

      // If the line has reached the maximum length, add it to the array and start a new one
      if (currentLine.length === CHARS_PER_LINE) {
        lines.push(currentLine);
        currentLine = '';
      }
    }

    // Add the last line if it's not empty
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  };

  // Function to format text before submission
  const prepareMessageForSubmission = (text) => {
    const preview = generatePreview(text);

    // Format each line, adding spaces to CHARS_PER_LINE
    return preview.map(line => {
      if (line.length < CHARS_PER_LINE) {
        return line + ' '.repeat(CHARS_PER_LINE - line.length);
      }
      return line;
    }).join('\n');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled && timeRemaining === 0) {
      const formattedMsg = prepareMessageForSubmission(message);

      // Add length check
      if (formattedMsg.length > maxLength) {
        alert(`Message exceeds the maximum length of ${maxLength} characters`);
        return;
      }

      // Send message - cooldown will be set after transaction confirmation in MessageHandler
      onSendMessage(formattedMsg);
      setMessage('');
    }
  };

  const handleInput = (e) => {
    const newValue = e.target.value;
    setMessage(newValue);
  };

  // Get current user's avatar code from profile or cache
  const getAvatarCode = () => {
    // First try to get from userProfile directly
    if (userProfile?.avatarCode) {
      return userProfile.avatarCode;
    }
    
    // Try to get from cache
    if (account && profileCache && profileCache[account]) {
      return profileCache[account].avatarCode;
    }
    
    // No avatar code found, will use address for generation
    return null;
  };

  // Calculate statistics
  const currentLength = message.length;
  const formattedLength = preview.reduce((sum, line) => sum + Math.min(line.length, CHARS_PER_LINE), 0);
  const paddedLength = preview.length * CHARS_PER_LINE;
  const linesUsed = preview.length;

  // Check if limits are exceeded
  const isExceedingLength = paddedLength > maxLength;
  const isExceedingLines = linesUsed > MAX_LINES;

  // Determine button text based on cooldown status
  const displayButtonText = timeRemaining > 0 
    ? `Wait ${timeRemaining}s` 
    : buttonText;

  return (
    <form className={`mx-4 mt-4 flex flex-col ${isReply ? 'p-2' : 'p-4'} inset-ring rounded-xl inset-ring-white/10 ${isReply ? 'bg-gray-900/30' : ''}`} onSubmit={handleSubmit}>
      <div className="flex items-start">
        <div className="shrink-0 mr-4">
          <div className={`${isReply ? 'w-8 h-8' : 'w-10 h-10'} bg-gray-800 rounded-md shrink-0`}>
            <Avatar 
              address={account} 
              avatarCode={getAvatarCode()} 
              size={isReply ? "small" : "medium"}
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="">
            <textarea
              ref={textareaRef}
              rows={isReply ? "2" : "3"}
              value={message}
              onChange={handleInput}
              placeholder={placeholder || "What's new"}
              className={`block resize-none font-mono text-xs min-h-[${isReply ? '60' : '80'}px] overflow-hidden bg-transparent focus:outline-none`}
              style={{
                height: 'auto',
                letterSpacing: '0',
                width: `${CHARS_PER_LINE}ch`,
                backgroundSize: '100% 20px',
                lineHeight: '20px',
                padding: '0'
              }}
            />
          </div>
          <div className='py-2 border-white/10 border-b-1'></div>

          <div className="flex justify-between items-center pt-2">
            <div className={`text-xs font-mono ${isExceedingLength || isExceedingLines ? 'text-red-500' : 'text-gray-400'}`}>
              Lines: {linesUsed} / {MAX_LINES} {isExceedingLength || isExceedingLines ? '(Too long)' : ''}
            </div>
            <div className="shrink-0">
              <button
                type="submit"
                className={`font-mono text-xs ${
                  timeRemaining > 0 
                    ? 'text-gray-500 cursor-not-allowed' 
                    : isExceedingLength || isExceedingLines 
                      ? 'text-red-500 cursor-not-allowed' 
                      : 'text-sky-300 hover:text-sky-200'
                }`}
                disabled={disabled || !message.trim() || isExceedingLength || isExceedingLines || timeRemaining > 0}
                title={timeRemaining > 0 ? `Cooldown: ${timeRemaining} seconds remaining` : ""}
              >
                [ {displayButtonText} ]
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

export default MessageForm;