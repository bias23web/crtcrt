// src/pages/Profile.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWeb3 } from '../contexts/Web3Context';
import Avatar from '../components/Avatar';

function Profile({ isViewMode = false }) {
  const {
    account,
    contract,
    userProfile,
    updateProfile,
    updateAvatar,
    deactivateProfile,
    loading,
    setLoading,
    updateProfileCache,
    reconnectSigner
  } = useWeb3();

  const [nickname, setNickname] = useState('');
  const [avatarCode, setAvatarCode] = useState('');
  const [saveStatus, setSaveStatus] = useState({ type: '', message: '' });
  const [viewProfile, setViewProfile] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const { address } = useParams();
  const navigate = useNavigate();

  // Load profile data
  useEffect(() => {
    if (isViewMode && address) {
      loadUserProfile(address);
    } else if (userProfile) {
      setNickname(userProfile.nickname || '');
      setAvatarCode(userProfile.avatarCode || '');
    }
  }, [userProfile, isViewMode, address]);

  // Load profile of another user
  const loadUserProfile = async (userAddress) => {
    if (!contract) return;

    try {
      setLoading(true);
      const [nickname, avatarCode, isActive] = await contract.getUserProfile(userAddress);

      if (nickname) {
        // Create profile object
        const profile = {
          address: userAddress,
          nickname,
          avatarCode,
          isActive
        };

        // Update profile cache
        updateProfileCache(userAddress, {
          nickname,
          avatarCode,
          isActive
        });

        setViewProfile(profile);
      } else {
        setSaveStatus({
          type: 'error',
          message: 'Profile not found'
        });
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      setSaveStatus({
        type: 'error',
        message: 'Error loading profile'
      });
    } finally {
      setLoading(false);
    }
  };

  // Update profile
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    try {
      setSaveStatus({ type: 'loading', message: 'Updating profile...' });

      // Try to reconnect the signer first
      let contractWithSigner;
      try {
        contractWithSigner = await reconnectSigner();
        if (!contractWithSigner) {
          throw new Error('Failed to connect to wallet');
        }
        console.log('Signer reconnected successfully for profile update');
      } catch (signerError) {
        console.error('Error updating signer:', signerError);
        setSaveStatus({
          type: 'error',
          message: 'Failed to connect to wallet. Please check your MetaMask connection'
        });
        return;
      }

      // Use the contract with fresh signer
      const tx = await contractWithSigner.updateProfile(nickname.trim(), avatarCode.trim());
      console.log('Profile update transaction sent:', tx.hash);
      
      await tx.wait();
      console.log('Profile updated successfully');

      // Update profile cache
      updateProfileCache(account, {
        nickname: nickname.trim(),
        avatarCode: avatarCode.trim(),
        isActive: true
      });

      setSaveStatus({
        type: 'success',
        message: 'Profile updated successfully!'
      });

      // Clear status after 3 seconds
      setTimeout(() => {
        setSaveStatus({ type: '', message: '' });
      }, 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setSaveStatus({
        type: 'error',
        message: error.message.includes('Nickname already taken')
          ? 'This nickname is already taken'
          : `Error: ${error.message}`
      });
    }
  };

  // Update avatar only
  const handleUpdateAvatar = async () => {
    try {
      setSaveStatus({ type: 'loading', message: 'Updating avatar...' });

      // Try to reconnect the signer first
      let contractWithSigner;
      try {
        contractWithSigner = await reconnectSigner();
        if (!contractWithSigner) {
          throw new Error('Failed to connect to wallet');
        }
        console.log('Signer reconnected successfully for avatar update');
      } catch (signerError) {
        console.error('Error updating signer:', signerError);
        setSaveStatus({
          type: 'error',
          message: 'Failed to connect to wallet. Please check your MetaMask connection'
        });
        return;
      }

      // Use the contract with fresh signer
      const tx = await contractWithSigner.updateAvatar(avatarCode.trim());
      console.log('Avatar update transaction sent:', tx.hash);
      
      await tx.wait();
      console.log('Avatar updated successfully');

      // Update profile cache with new avatar
      updateProfileCache(account, {
        ...userProfile,
        avatarCode: avatarCode.trim()
      });

      setSaveStatus({
        type: 'success',
        message: 'Avatar updated successfully!'
      });

      // Clear status after 3 seconds
      setTimeout(() => {
        setSaveStatus({ type: '', message: '' });
      }, 3000);
    } catch (error) {
      console.error('Error updating avatar:', error);
      setSaveStatus({
        type: 'error',
        message: `Error: ${error.message}`
      });
    }
  };

  // Deactivate profile
  const handleDeactivateProfile = async () => {
    if (!window.confirm('Are you sure you want to deactivate your profile? Your nickname will become available to other users.')) {
      return;
    }

    try {
      setSaveStatus({ type: 'loading', message: 'Deactivating profile...' });

      // Try to reconnect the signer first
      let contractWithSigner;
      try {
        contractWithSigner = await reconnectSigner();
        if (!contractWithSigner) {
          throw new Error('Failed to connect to wallet');
        }
        console.log('Signer reconnected successfully for profile deactivation');
      } catch (signerError) {
        console.error('Error updating signer:', signerError);
        setSaveStatus({
          type: 'error',
          message: 'Failed to connect to wallet. Please check your MetaMask connection'
        });
        return;
      }

      // Use the contract with fresh signer
      const tx = await contractWithSigner.deactivateProfile();
      console.log('Profile deactivation transaction sent:', tx.hash);
      
      await tx.wait();
      console.log('Profile deactivated successfully');

      // Update profile cache with deactivated status
      updateProfileCache(account, {
        ...userProfile,
        isActive: false
      });

      setSaveStatus({
        type: 'success',
        message: 'Profile deactivated. Redirecting...'
      });

      // Redirect to home after 2 seconds
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (error) {
      console.error('Error deactivating profile:', error);
      setSaveStatus({
        type: 'error',
        message: `Error: ${error.message}`
      });
    }
  };

  // View mode for other user's profile
  if (isViewMode) {
    if (loading) {
      return <div className="max-w-2xl mx-auto p-6 mt-20 font-mono text-center">Loading...</div>;
    }

    if (!viewProfile) {
      return (
        <div className="max-w-2xl mx-auto p-6 mt-20 inset-ring rounded-xl inset-ring-white/10">
          <h2 className="text-xl font-mono mb-4">Profile Not Found</h2>
          <p className="text-gray-400 font-mono">User hasn't created a profile or the address is incorrect.</p>
          <div className="mt-4">
            <button
              className="font-mono text-sky-300 hover:text-sky-200"
              onClick={() => navigate('/')}
            >
              [ Return to Home ]
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto p-6 mt-20 inset-ring rounded-xl inset-ring-white/10">
        <h2 className="text-xl font-mono mb-6">User Profile</h2>

        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
          <div className="w-32 h-32 bg-gray-800 rounded-xl overflow-hidden flex items-center justify-center">
            <Avatar
              address={viewProfile.address}
              avatarCode={viewProfile.avatarCode}
              size="large"
            />
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-mono mb-2">@{viewProfile.nickname}</h3>

            <div className="mb-4 font-mono">
              <span className="text-gray-400 text-sm">Address: </span>
              <span className="text-gray-300 text-sm break-all">{viewProfile.address}</span>
            </div>

            <div className="mb-4 font-mono">
              <span className="text-gray-400 text-sm">Status: </span>
              <span className={`text-sm ${viewProfile.isActive ? 'text-green-300' : 'text-red-300'}`}>
                {viewProfile.isActive ? 'Active' : 'Deactivated'}
              </span>
            </div>

            <div className="mt-4">
              <button
                className="font-mono text-sky-300 hover:text-sky-200"
                onClick={() => navigate('/')}
              >
                [ Return to Home ]
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Edit mode for own profile
  return (
    <div className="max-w-2xl mx-auto p-6 mt-20 inset-ring rounded-xl inset-ring-white/10">
      <h2 className="text-xl font-mono mb-6">My Profile</h2>

      <form onSubmit={handleUpdateProfile}>
        {saveStatus.message && (
          <div className={`mb-4 p-3 rounded-md font-mono ${
            saveStatus.type === 'error' ? 'text-red-300' :
            saveStatus.type === 'success' ? 'text-green-300' :
            'text-blue-300'
          }`}>
            {saveStatus.message}
          </div>
        )}

        <div className="flex flex-col md:flex-col gap-8">
          <div className="flex flex-row gap-8">
            <div>
              <div className="flex items-center justify-center ">
                <div className="w-32 h-32 bg-gray-800 rounded-xl overflow-hidden flex items-center justify-center">
                  <Avatar address={account} avatarCode={userProfile?.avatarCode} size="large" />
                </div>
              </div>
              <p className="text-center text-xs text-gray-400 mt-2 font-mono">Current Avatar</p>
            </div>

            <div className="mb-2">
              <h3 className="text-sm font-mono mb-2">Profile Details</h3>
              <div className="p-3 inset-ring rounded-md inset-ring-white/10 bg-gray-800">
                <div className="mb-2 font-mono">
                  <span className="text-gray-400 text-sm">Address: </span>
                  <span className="text-gray-300 text-sm break-all">{account}</span>
                </div>
                <div className="mb-2 font-mono">
                  <span className="text-gray-400 text-sm">Nickname: </span>
                  <span className="text-white">@{userProfile?.nickname || 'Not set'}</span>
                </div>
                <div className="font-mono">
                  <span className="text-gray-400 text-sm">Status: </span>
                  <span className={`text-sm ${userProfile?.isActive ? 'text-green-300' : 'text-red-300'}`}>
                    {userProfile?.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-4">
            <div className="mb-4">
              <label htmlFor="nickname" className="block mb-1 font-mono">
                Nickname
              </label>
              <input
                type="text"
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter nickname"
                className="w-full p-2 bg-transparent inset-ring rounded-md inset-ring-white/10 font-mono"
                required
              />
              <p className="text-xs text-gray-400 mt-1 font-mono">
                Letters, numbers, _ // max 32 characters
              </p>
            </div>

            <div className='flex flex-row gap-8'>
              <div className="mb-6 grow">
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="avatarCode" className="block font-mono">
                    Avatar Code
                  </label>
                  <button
                    type="button"
                    className="text-xs text-sky-300 hover:text-sky-200 font-mono cursor-pointer"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? '[ Hide Preview ]' : '[ Show Preview ]'}
                  </button>
                </div>
                <textarea
                  id="avatarCode"
                  value={avatarCode}
                  onChange={(e) => setAvatarCode(e.target.value)}
                  placeholder={account}
                  className="w-full p-2 bg-transparent inset-ring rounded-md inset-ring-white/10 font-mono text-xs h-32"
                />
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  Use "avatar1" through "avatar9" or paste an image URL
                </p>
              </div>

              {showPreview && (
                <div className="mb-6">
                  <h3 className="text-sm font-mono mb-2">Avatar Preview</h3>
                  <div className="p-3 inset-ring rounded-md inset-ring-white/10 flex items-center justify-center">
                    <div className="w-32 h-32 bg-gray-800 rounded-xl overflow-hidden flex items-center justify-center">
                      <Avatar address={account} avatarCode={avatarCode} size="large" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-6 mt-6 flex flex-wrap gap-3 font-mono">
          <button
            type="submit"
            className="text-sky-300 hover:text-sky-200 disabled:text-gray-500 cursor-pointer"
            disabled={loading || !nickname.trim()}
          >
            [ Update Profile ]
          </button>

          {userProfile?.nickname && (
            <button
              type="button"
              className="text-sky-300 hover:text-sky-200 disabled:text-gray-500 cursor-pointer"
              onClick={handleUpdateAvatar}
              disabled={loading}
            >
              [ Update Avatar ]
            </button>
          )}

          {userProfile?.isActive && (
            <button
              type="button"
              className="text-red-300 hover:text-red-200 disabled:text-gray-500 ml-auto cursor-pointer"
              onClick={handleDeactivateProfile}
              disabled={loading}
            >
              [ Deactivate ]
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default Profile;