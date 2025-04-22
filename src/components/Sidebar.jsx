// Изменения в Sidebar.jsx
import { Link, useLocation } from 'react-router-dom';
import { useWeb3 } from '../contexts/Web3Context';
import { useStats } from '../contexts/StatsContext';
import Avatar from './Avatar';
import PostingRateChart from './PostingRateChart';
import PriceTicker from './PriceTicker'; // Import our new component

function Sidebar() {
  const location = useLocation();
  const { account, userProfile, connectWallet } = useWeb3();
  const { messageTimestamps, avgPostingRate } = useStats();

  console.log('Sidebar: Received timestamps', messageTimestamps);

  // Check if current route is active
  const isActive = (path) => {
    return location.pathname === path ? 'bg-gray-800' : '';
  };

  return (
    <div className="w-64 flex flex-col h-screen z-10 sticky top-0">
      {/* Logo */}
      <div className="p-6 py-4 border-b border-gray-800">
        <Link to="/" className="flex items-center hover:text-red-400">
          <span className="text-2xl font-mono">// crkcrk</span>
        </Link>
      </div>

      {/* Price Ticker */}
      <div className="px-4 pb-4 mt-4">
        <div className="inset-ring rounded-md inset-ring-white/10 p-2 bg-gray-900/30">
          <PriceTicker />
        </div>
      </div>

      {/* Navigation Menu */}
      <div className="px-4">
        <nav className="space-y-2">
          {account && (
            <>
              <Link
                to="/profile"
                className={`block py-2 px-4 rounded-md hover:bg-gray-800 font-mono ${isActive('/profile')}`}
              >
                [ Edit Profile ]
              </Link>
            </>
          )}
          <Link
            to="/about"
            className={`block py-2 px-4 rounded-md hover:bg-gray-800 font-mono ${isActive('/about')}`}
          >
            [ About ]
          </Link>
          <Link
            to="https://github.com/bias23web/crtcrt"
            className={`block py-2 px-4 rounded-md hover:bg-gray-800 font-mono`}
          >
            [ Github ]
          </Link>
        </nav>
      </div>

      {/* User Profile Section */}
      <div className="p-4 mt-auto border-b border-gray-800">
        {account ? (
          <div className="user-info">
            <div className="flex items-center relative gap-2 w-full">
              <div className="!w-12 !h-12 flex-none rounded-full overflow-hidden">
                <Avatar address={account} avatarCode={userProfile?.avatarCode} />
              </div>
              <div className="overflow-hidden shrink">
                <div className="font-mono font-bold text-base">
                  {userProfile?.nickname ? `@${userProfile.nickname}` : ''}
                </div>
                <div className="text-gray-400 text-xs font-mono">
                  {`${account.slice(0, 6)}...${account.slice(-4)}`}
                </div>
              </div>
            </div>

            {userProfile?.isActive === false && (
              <div className="text-red-400 text-xs mb-4 font-mono">
                Profile deactivated
              </div>
            )}

          </div>
        ) : (
          <button
            onClick={connectWallet}
            className="text-nowrap w-full py-2 px-4 font-mono uppercase text-sky-300 hover:text-sky-200 transition cursor-pointer"
          >
            [ Connect Wallet ]
          </button>
        )}
      </div>

      {/* Network Stats Section */}
      <div className="px-4 py-4">
        <div className="mb-3">
          <div className="text-xs font-mono flex justify-between">
            <span className="text-gray-400">Posting Rate:</span>
            <span className="text-white">{avgPostingRate}</span>
          </div>
        </div>

        <div className="mb-2">
          <div className="inset-ring rounded-md inset-ring-white/10 p-2 bg-gray-900/30">
            <PostingRateChart timestamps={messageTimestamps} />
          </div>
          <p className="text-[0.65rem] text-gray-500 font-mono mt-1">
            Post interval distribution
          </p>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;