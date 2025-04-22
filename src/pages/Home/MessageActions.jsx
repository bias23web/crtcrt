// src/pages/Home/MessageActions.jsx
import React from 'react';

/**
 * Message actions component (auto-refresh controls)
 */
const MessageActions = ({ 
  autoRefresh, 
  lastCheckedTimestamp, 
  loading, 
  onToggleAutoRefresh, 
  onRefresh 
}) => {
  return (
    <div className="flex justify-between items-center mb-6 sticky top-0 z-10 pt-4 px-4">
      <h2 className="text-xl font-mono text-gray-500 px-2 hidden sm:block">// MESSAGES</h2>
      <div className="flex items-center">
        <span className="mr-2 font-mono text-xs">Auto-refresh:</span>
        <button
          onClick={onToggleAutoRefresh}
          className={`text-nowrap px-3 py-1 rounded font-mono text-xs cursor-pointer ${
            autoRefresh ? 'text-sky-300 hover:text-sky-200' : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          [ {autoRefresh ? 'ON' : 'OFF'} ]
        </button>
        
        {!autoRefresh && lastCheckedTimestamp > 0 && (
          <span className="ml-3 text-xs text-gray-500 font-mono">
            Last checked: {new Date(lastCheckedTimestamp).toLocaleTimeString()}
          </span>
        )}
        
        {!autoRefresh && !loading && (
          <button
            onClick={onRefresh}
            className="ml-3 text-xs text-sky-300 hover:text-sky-200 font-mono text-nowrap cursor-pointer"
          >
            [ refresh now ]
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageActions;