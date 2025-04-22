// src/App.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ethers } from 'ethers';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Profile from './pages/Profile';
import About from './pages/About';
import contractABI from '../contractABI.json';
import { Web3Provider } from './contexts/Web3Context';
import './App.css';
import { StatsProvider } from './contexts/StatsContext';

function App() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wsConnection, setWsConnection] = useState(null);
  const [contractParameters, setContractParameters] = useState({
    maxMessageLength: 762,
    messageCooldown: 60,
    maxReturnCount: 50,
    maxActiveMessages: 500
  });
  const [needsProfile, setNeedsProfile] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('initializing');
  const isConnectingRef = useRef(false);

  // Connect to wallet and contract
  const connectWallet = useCallback(async () => {
    if (isConnectingRef.current) {
      console.log('Connection already in progress, skipping');
      return false;
    }

    try {
      isConnectingRef.current = true;
      setConnectionStatus('connecting');
      console.log('Starting wallet connection...');
      setLoading(true);

      if (window.ethereum) {
        // Close existing WebSocket connection if any
        if (wsConnection) {
          try {
            if (wsConnection.readyState === 0 || wsConnection.readyState === 1) {
              wsConnection.close();
            }
          } catch (error) {
            console.error('Error closing existing WebSocket:', error);
          }
          setWsConnection(null);
        }

        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const address = await signer.getAddress();

        console.log(`Connected to wallet address: ${address}`);

        // Check if contract address exists
        const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
        if (!contractAddress) {
          console.error('Contract address not found in environment variables');
          setConnectionStatus('error');
          return false;
        }

        // Connect to the contract
        const contract = new ethers.Contract(contractAddress, contractABI, signer);
        console.log('Contract instance created');

        setProvider(provider);
        setContract(contract);
        setAccount(address);

        // Load contract parameters
        try {
          console.log('Loading contract parameters...');
          const [maxLength, cooldown, returnCount, activeMessages] = await contract.getParameters();
          setContractParameters({
            maxMessageLength: maxLength.toNumber(),
            messageCooldown: cooldown.toNumber(),
            maxReturnCount: returnCount.toNumber(),
            maxActiveMessages: activeMessages.toNumber()
          });
          console.log('Contract parameters loaded successfully');
        } catch (error) {
          console.error('Error loading contract parameters:', error);
        }

        // Load user profile
        try {
          console.log('Loading user profile...');
          const [nickname, avatarCode, isActive] = await contract.getUserProfile(address);

          if (nickname && nickname.length > 0) {
            // User has a profile
            console.log(`Profile found: ${nickname}, active: ${isActive}`);
            setUserProfile({
              nickname,
              avatarCode,
              isActive
            });
            setNeedsProfile(!isActive);
          } else {
            // User doesn't have a profile
            console.log('No profile found for user');
            setUserProfile(null);
            setNeedsProfile(true);
          }
        } catch (error) {
          console.error('Error checking profile:', error);
          setUserProfile(null);
          setNeedsProfile(true);
        }

        setConnectionStatus('connected');
        return true;
      } else {
        alert('MetaMask not detected! Please install MetaMask to use this application.');
        setConnectionStatus('no-metamask');
        return false;
      }
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      setUserProfile(null);
      setNeedsProfile(false);
      setConnectionStatus('error');
      return false;
    } finally {
      // Small delay before removing loading state
      setTimeout(() => {
        isConnectingRef.current = false;
        setLoading(false);
      }, 100);
    }
  }, [wsConnection]);

  // Load read-only contract for non-authenticated users
  const loadReadOnlyContract = useCallback(async () => {
    try {
      console.log('Loading read-only contract...');
      setConnectionStatus('loading-readonly');
      const rpcUrl = import.meta.env.VITE_RPC_URL || 'https://mainnet-rpc.rnk.dev/';
      const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

      if (!contractAddress) {
        console.error('Contract address not found in environment variables');
        setConnectionStatus('error');
        return;
      }

      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      console.log('Read-only contract instance created');

      // Load contract parameters
      try {
        const [maxLength, cooldown, returnCount, activeMessages] = await contract.getParameters();
        setContractParameters({
          maxMessageLength: maxLength.toNumber(),
          messageCooldown: cooldown.toNumber(),
          maxReturnCount: returnCount.toNumber(),
          maxActiveMessages: activeMessages.toNumber()
        });
        console.log('Contract parameters loaded successfully');
      } catch (paramError) {
        console.error('Error loading contract parameters:', paramError);
      }

      setProvider(provider);
      setContract(contract);
      setConnectionStatus('readonly');
    } catch (error) {
      console.error('Error loading read-only contract:', error);
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Setup WebSocket connection
  const setupWebSocket = useCallback(() => {
    if (account) {
      console.log('Setting up WebSocket connection...');
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';

      // Close existing connection if any
      if (wsConnection) {
        try {
          if (wsConnection.readyState === 0 || wsConnection.readyState === 1) {
            wsConnection.close();
          }
        } catch (error) {
          console.error('Error closing existing WebSocket:', error);
        }
      }

      const ws = new WebSocket(wsUrl);
      let reconnectTimer = null;

      ws.onopen = () => {
        console.log('WebSocket connected');
        // Register user with WebSocket server
        ws.send(JSON.stringify({
          type: 'register',
          address: account
        }));

        // Clear reconnect timer if any
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message:', data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected, code:', event.code);

        // Attempt to reconnect if closure was unexpected and component is still mounted
        if (event.code !== 1000 && event.code !== 1001) {
          reconnectTimer = setTimeout(() => {
            if (account) { // Check that account is still connected
              console.log('Attempting to reconnect WebSocket...');
              // Do NOT call setupWebSocket() recursively!
              const newWs = new WebSocket(wsUrl);
              // Set up for new connection...
              setWsConnection(newWs);
            }
          }, 3000);
        }
      };

      setWsConnection(ws);

      return () => {
        console.log('Cleaning up WebSocket connection...');
        // Clean up reconnect timer
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
        }

        // Close WebSocket if open
        if (ws.readyState === 1 || ws.readyState === 0) {
          ws.close(1000, "Component unmounted");
        }
      };
    }
  }, [account]); // Remove wsConnection from dependencies!

  // Update the useEffect hook
  useEffect(() => {
    let cleanup;
    if (account) {
      cleanup = setupWebSocket();
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [account, setupWebSocket]);

  // Initial wallet connection check
  useEffect(() => {
    const checkConnection = async () => {
      console.log('Checking wallet connection...');
      if (window.ethereum && !isConnectingRef.current) {
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const accounts = await provider.listAccounts();

          if (accounts.length > 0) {
            console.log('Found connected wallet, connecting...');
            await connectWallet();
          } else {
            console.log('No wallet connected, loading read-only contract...');
            await loadReadOnlyContract();
          }
        } catch (error) {
          console.error('Error checking wallet connection:', error);
          await loadReadOnlyContract();
        }
      } else {
        console.log('No Ethereum provider found, loading read-only contract...');
        await loadReadOnlyContract();
      }
    };

    checkConnection();
  }, [connectWallet, loadReadOnlyContract]);
  
  // Updated useEffect for setupWebSocket
  useEffect(() => {
    console.log('WebSocket effect running, account:', !!account);

    let cleanup;
    if (account) {
      // Only run setupWebSocket if there is an account
      cleanup = setupWebSocket();
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [account, setupWebSocket]); // Dependency only on account and setupWebSocket

  // Handle MetaMask account changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts) => {
        console.log('MetaMask accounts changed:', accounts);
        if (accounts.length > 0) {
          await connectWallet();
        } else {
          console.log('Wallet disconnected');
          setAccount(null);
          setUserProfile(null);
          setNeedsProfile(false);
          // Load read-only contract
          await loadReadOnlyContract();
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);

      // Handle network changes
      const handleChainChanged = () => {
        console.log('Network changed, reloading page...');
        window.location.reload();
      };

      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [connectWallet, loadReadOnlyContract]);

  // Create profile function
  const createProfile = async (nickname, avatarCode) => {
    if (!contract || !account) return false;

    try {
      console.log(`Creating profile: ${nickname}`);
      setLoading(true);
      const tx = await contract.updateProfile(nickname, avatarCode);
      console.log('Profile creation transaction sent:', tx.hash);
      await tx.wait();
      console.log('Profile created successfully');

      setUserProfile({
        nickname,
        avatarCode,
        isActive: true
      });

      setNeedsProfile(false);
      return true;
    } catch (error) {
      console.error('Error creating profile:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Update profile function
  const updateProfile = async (nickname, avatarCode) => {
    if (!contract || !account) return false;

    try {
      console.log(`Updating profile to: ${nickname}`);
      setLoading(true);
      const tx = await contract.updateProfile(nickname, avatarCode);
      console.log('Profile update transaction sent:', tx.hash);
      await tx.wait();
      console.log('Profile updated successfully');

      setUserProfile({
        ...userProfile,
        nickname,
        avatarCode
      });

      return true;
    } catch (error) {
      console.error('Error updating profile:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Update only avatar
  const updateAvatar = async (avatarCode) => {
    if (!contract || !account || !userProfile) return false;

    try {
      console.log('Updating avatar...');
      setLoading(true);
      const tx = await contract.updateAvatar(avatarCode);
      console.log('Avatar update transaction sent:', tx.hash);
      await tx.wait();
      console.log('Avatar updated successfully');

      setUserProfile({
        ...userProfile,
        avatarCode
      });

      return true;
    } catch (error) {
      console.error('Error updating avatar:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Deactivate profile
  const deactivateProfile = async () => {
    if (!contract || !account || !userProfile) return false;

    try {
      console.log('Deactivating profile...');
      setLoading(true);
      const tx = await contract.deactivateProfile();
      console.log('Profile deactivation transaction sent:', tx.hash);
      await tx.wait();
      console.log('Profile deactivated successfully');

      setUserProfile({
        ...userProfile,
        isActive: false
      });

      return true;
    } catch (error) {
      console.error('Error deactivating profile:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Context for web3 access from any component
  const web3Context = {
    account,
    provider,
    contract,
    userProfile,
    contractParameters,
    wsConnection,
    needsProfile,
    connectWallet,
    createProfile,
    updateProfile,
    updateAvatar,
    deactivateProfile,
    loading,
    connectionStatus,
    setLoading
  };

  if (loading) {
    return (
      <div className="loading flex items-center justify-center h-screen">
        {/* Loading indicator */}
      </div>
    );
  }

  return (
    <Web3Provider value={web3Context}>
      <StatsProvider>
        <div className="flex min-h-screen bg-gray-950">
          {/* Main content */}
          <main className="flex-1 transition-all">
            <div className="mx-auto">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/profile" element={
                  account ? <Profile /> : <Navigate to="/" replace />
                } />
                <Route path="/user/:address" element={<Profile isViewMode={true} />} />
              </Routes>
            </div>
          </main>
          <Sidebar />
        </div>
      </StatsProvider>
    </Web3Provider>
  );
}

export default App;