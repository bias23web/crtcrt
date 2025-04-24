// src/pages/Home/DebugPanel.jsx
import React, { useCallback, useState, useEffect } from 'react';
import { calculatePostingRate } from '../../utils/messageHelpers';

/**
 * Debug panel component for application monitoring
 */
const DebugPanel = ({
  account,
  contract,
  hasProfile,
  messages,
  messageIdCache,
  loading,
  autoRefresh,
  newMessagesCount,
  lastKnownMessageId,
  pendingMessages,
  messageTimestampsRef,
  deletionStatus,
  totalMessagesCountRef,
  connectionStatus,
  wsConnection,
  contractParameters,
  expandedRepliesState,
  memoryUsage
}) => {
  const [showDebugPanel, setShowDebugPanel] = useState(() => {
    const savedState = localStorage.getItem('showDebugPanel');
    return savedState === 'true';
  });
  const [contractStats, setContractStats] = useState({
    activeMessages: 0,
    messageCount: 0,
    ownerAddress: null
  });
  const [refreshTime, setRefreshTime] = useState(null);
  const [expanded, setExpanded] = useState({
    messages: false,
    network: false,
    memory: false,
    contract: false
  });

  // Toggle debug panel
  const toggleDebugPanel = useCallback(() => {
    setShowDebugPanel(prev => {
      const newState = !prev;
      localStorage.setItem('showDebugPanel', newState.toString());
      return newState;
    });
  }, []);

  // Toggle section expansion
  const toggleSection = useCallback((section) => {
    setExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);

  // Fetch contract stats
  useEffect(() => {
    const fetchContractStats = async () => {
      if (contract) {
        try {
          const [activeMessages, messageCount, ownerAddress] = await Promise.all([
            contract.getTotalActiveMessages().then(v => v.toString()),
            contract.getMessageCount().then(v => v.toString()),
            contract.getOwner()
          ]);

          setContractStats({
            activeMessages,
            messageCount,
            ownerAddress
          });
        } catch (error) {
          console.error("Error fetching contract stats:", error);
        }
      }
    };

    if (showDebugPanel) {
      fetchContractStats();
      const interval = setInterval(fetchContractStats, 30000); // refresh every 30s
      return () => clearInterval(interval);
    }
  }, [contract, showDebugPanel]);

  // Get memory usage stats (if available in browser)
  const getMemoryInfo = useCallback(() => {
    const memoryInfo = {
      available: false,
      total: 'N/A',
      used: 'N/A',
      limit: 'N/A'
    };

    if (window.performance && window.performance.memory) {
      const memory = window.performance.memory;
      memoryInfo.available = true;
      memoryInfo.total = `${Math.round(memory.totalJSHeapSize / (1024 * 1024))} MB`;
      memoryInfo.used = `${Math.round(memory.usedJSHeapSize / (1024 * 1024))} MB`;
      memoryInfo.limit = `${Math.round(memory.jsHeapSizeLimit / (1024 * 1024))} MB`;
    }

    return memoryInfo;
  }, []);

  // Refresh debug info
  const handleRefresh = useCallback(() => {
    setRefreshTime(new Date().toLocaleTimeString());
  }, []);

  // Only show in development
  const isDev = import.meta.env.DEV;

  // Format relative time
  const formatTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Format WebSocket state
  const formatWsState = (ws) => {
    if (!ws) return 'Not connected';
    switch (ws.readyState) {
      case 0: return 'Connecting';
      case 1: return 'Connected';
      case 2: return 'Closing';
      case 3: return 'Closed';
      default: return 'Unknown';
    }
  };

  return (
    <>
      {/* Debug toggle button */}

      {isDev && (
        <button
          onClick={toggleDebugPanel}
          className="fixed bottom-4 right-4 w-8 h-8 flex items-center justify-center text-sky-300 rounded-full shadow-lg hover:text-sky-200 z-50 font-mono text-xs"
        >
          [?]
        </button>
      )}

      {/* Debug panel */}
      {isDev && showDebugPanel && (
        <div className="z-100 debug-panel bg-gray-950/30 backdrop-blur-md font-mono my-8 p-4 inset-ring rounded-xl inset-ring-white/10 text-xs fixed bottom-8 right-8 max-w-sm overflow-auto max-h-[80vh]">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold">Debug Panel</h3>
            <div className="flex gap-2">
              {/* <button onClick={handleRefresh} className="text-sky-300 hover:text-sky-200">
                [↻]
              </button> */}
              <button onClick={toggleDebugPanel} className="text-red-300 hover:text-red-200">
                [×]
              </button>
            </div>
          </div>

          {refreshTime && (
            <div className="text-gray-400 text-xs mb-2">Last refreshed: {refreshTime}</div>
          )}

          {/* Connection section */}
          <div className="mb-2 border-b border-gray-800 pb-2">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => toggleSection('network')}
            >
              <span className="mr-1">{expanded.network ? '[-]' : '[+]'}</span>
              <h4 className="font-bold">Network</h4>
            </div>

            {expanded.network && (
              <div className="pl-4 mt-1 space-y-1">
                <div>
                  <span className="text-gray-400">Connection: </span>
                  <span className={`${connectionStatus === 'connected' ? 'text-green-300' :
                      connectionStatus === 'readonly' ? 'text-yellow-300' :
                        'text-red-300'
                    }`}>
                    {connectionStatus}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">WebSocket: </span>
                  <span className={`${wsConnection?.readyState === 1 ? 'text-green-300' : 'text-yellow-300'
                    }`}>
                    {formatWsState(wsConnection)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Account: </span>
                  <span className="break-all">{account || 'None'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Has Profile: </span>
                  <span>{hasProfile ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Loading: </span>
                  <span>{loading ? 'Yes' : 'No'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Messages section */}
          <div className="mb-2 border-b border-gray-800 pb-2">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => toggleSection('messages')}
            >
              <span className="mr-1">{expanded.messages ? '[-]' : '[+]'}</span>
              <h4 className="font-bold">Messages</h4>
            </div>

            {expanded.messages && (
              <div className="pl-4 mt-1 space-y-1">
                <div>
                  <span className="text-gray-400">Loaded: </span>
                  <span>{messages.length}</span>
                </div>
                <div>
                  <span className="text-gray-400">Main Messages: </span>
                  <span>{messages.filter(m => !m.isReply).length}</span>
                </div>
                <div>
                  <span className="text-gray-400">Reply Messages: </span>
                  <span>{messages.filter(m => m.isReply).length}</span>
                </div>
                <div>
                  <span className="text-gray-400">Pending Messages: </span>
                  <span>{pendingMessages.filter(m => !m.resolved).length}</span>
                </div>
                <div>
                  <span className="text-gray-400">New Messages: </span>
                  <span>{newMessagesCount}</span>
                </div>
                <div>
                  <span className="text-gray-400">Last Known ID: </span>
                  <span>{lastKnownMessageId}</span>
                </div>
                <div>
                  <span className="text-gray-400">Cache Size: </span>
                  <span>{messageIdCache.current?.size || 0}</span>
                </div>
                <div>
                  <span className="text-gray-400">Auto-Refresh: </span>
                  <span>{autoRefresh ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Expanded Replies: </span>
                  <span>{Object.keys(expandedRepliesState || {}).length}</span>
                </div>
                <div>
                  <span className="text-gray-400">Avg Posting Rate: </span>
                  <span>{calculatePostingRate(messageTimestampsRef.current)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Contract section */}
          <div className="mb-2 border-b border-gray-800 pb-2">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => toggleSection('contract')}
            >
              <span className="mr-1">{expanded.contract ? '[-]' : '[+]'}</span>
              <h4 className="font-bold">Contract</h4>
            </div>

            {expanded.contract && (
              <div className="pl-4 mt-1 space-y-1">
                <div>
                  <span className="text-gray-400">Contract Connected: </span>
                  <span>{contract ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Active Messages: </span>
                  <span>{contractStats.activeMessages}</span>
                </div>
                <div>
                  <span className="text-gray-400">Total Messages: </span>
                  <span>{contractStats.messageCount}</span>
                </div>
                <div>
                  <span className="text-gray-400">Max Length: </span>
                  <span>{contractParameters?.maxMessageLength || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Cooldown: </span>
                  <span>{contractParameters?.messageCooldown || 'N/A'}s</span>
                </div>
                <div>
                  <span className="text-gray-400">Max Messages: </span>
                  <span>{contractParameters?.maxActiveMessages || 'N/A'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Memory usage section */}
          <div className="mb-2">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => toggleSection('memory')}
            >
              <span className="mr-1">{expanded.memory ? '[-]' : '[+]'}</span>
              <h4 className="font-bold">Memory</h4>
            </div>

            {expanded.memory && (
              <div className="pl-4 mt-1 space-y-1">
                {getMemoryInfo().available ? (
                  <>
                    <div>
                      <span className="text-gray-400">Used: </span>
                      <span>{getMemoryInfo().used}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Total: </span>
                      <span>{getMemoryInfo().total}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Limit: </span>
                      <span>{getMemoryInfo().limit}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-400">Memory stats not available in this browser</div>
                )}
              </div>
            )}
          </div>

          {/* Status and errors */}
          {deletionStatus?.error && (
            <div className="text-red-500 mt-2 border-t border-gray-800 pt-2">
              Last Error: {deletionStatus.error}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default DebugPanel;