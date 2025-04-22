// src/contexts/Web3Context.jsx
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ethers } from 'ethers';

const Web3Context = createContext(null);

export const Web3Provider = ({ children, value }) => {
  // State for profile cache
  const [profileCache, setProfileCache] = useState({});
  
  // State for cooldown tracking
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState(0);
  
  // Ref to track connection state
  const connectionAttemptInProgress = useRef(false);

  // Function to update the last message timestamp (for cooldown)
  const updateLastMessageTimestamp = useCallback((timestamp) => {
    setLastMessageTimestamp(timestamp);
  }, []);

  // Function to fetch user profile with caching
  const fetchUserProfile = useCallback(async (address) => {
    // Check cache first
    if (profileCache[address]) {
      return profileCache[address];
    }
    
    // If not in cache, use temporary placeholder
    // This will prevent repeated attempts to load the same profile
    setProfileCache(prev => ({
      ...prev,
      [address]: { nickname: '', avatarCode: '', isActive: false, loading: true }
    }));
    
    // If contract is available
    if (value.contract) {
      try {
        const [nickname, avatarCode, isActive] = await value.contract.getUserProfile(address);
        
        // Create profile object
        const profile = { 
          nickname: nickname || '', 
          avatarCode: avatarCode || '',
          isActive: isActive || false,
          loading: false
        };
        
        // Save to cache
        setProfileCache(prev => ({
          ...prev,
          [address]: profile
        }));
        
        return profile;
      } catch (error) {
        console.error(`Error fetching profile for ${address}:`, error);
        
        // Update cache with error
        setProfileCache(prev => ({
          ...prev,
          [address]: { 
            nickname: '', 
            avatarCode: '', 
            isActive: false, 
            loading: false,
            error: true 
          }
        }));
        
        return null;
      }
    }
    
    return null;
  }, [value.contract, profileCache]);

  // Function to update cache when profile changes
  const updateProfileCache = useCallback((address, profileData) => {
    setProfileCache(prev => ({
      ...prev,
      [address]: profileData
    }));
  }, []);

  // Function to reconnect and refresh the signer
  const reconnectSigner = useCallback(async () => {
    if (connectionAttemptInProgress.current) {
      console.log('Connection attempt already in progress, skipping');
      return null;
    }

    connectionAttemptInProgress.current = true;

    try {
      console.log('Attempting to reconnect signer...');
      
      if (!window.ethereum) {
        console.error('No Ethereum provider found');
        return null;
      }
      
      if (!value.contract) {
        console.error('No contract instance available');
        return null;
      }

      // Request accounts access
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      
      // Verify we got a valid signer by attempting to get the address
      const address = await signer.getAddress();
      console.log(`Reconnected to wallet: ${address}`);
      
      // Connect contract to the new signer
      const contractWithSigner = value.contract.connect(signer);
      console.log('Contract successfully connected to new signer');
      
      return contractWithSigner;
    } catch (error) {
      console.error('Error reconnecting signer:', error);
      throw error; // Propagate error to caller
    } finally {
      connectionAttemptInProgress.current = false;
    }
  }, [value.contract]);

  // Extend context with new functions
  const enhancedValue = {
    ...value,
    profileCache,
    lastMessageTimestamp,
    fetchUserProfile,
    updateProfileCache,
    reconnectSigner,
    updateLastMessageTimestamp
  };

  return (
    <Web3Context.Provider value={enhancedValue}>
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
};