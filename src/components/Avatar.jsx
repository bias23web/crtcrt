// src/components/Avatar.jsx
import { useState, useEffect, useRef } from 'react';
import { createAvatar } from '../utils/avatar.js';

function Avatar({ avatarCode, address, size = 'medium' }) {
  const [isReady, setIsReady] = useState(false);
  const avatarRef = useRef(null);

  useEffect(() => {
    setIsReady(false);
    
    const prepareAvatar = async () => {
      let url = '';
      
      if (avatarCode) {
        if (avatarCode.startsWith('http')) {
          url = avatarCode;
        } else if (avatarCode.startsWith('avatar')) {
          const avatarId = avatarCode.replace('avatar', '');
          url = `/avatars/avatar${avatarId}.png`;
        } else {
          url = `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(avatarCode)}`;
        }
      } else if (address) {
        url = createAvatar(address);
      } else {
        url = '/avatars/default.png';
      }
      
      if (url.startsWith('http') || url.startsWith('/')) {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            if (avatarRef.current) {
              avatarRef.current.src = url;
              setIsReady(true);
            }
            resolve();
          };
          img.onerror = () => {
            if (avatarRef.current) {
              avatarRef.current.src = '/avatars/default.png';
              setIsReady(true);
            }
            resolve();
          };
          img.src = url;
        });
      } else {
        if (avatarRef.current) {
          avatarRef.current.src = url;
          setIsReady(true);
        }
        return Promise.resolve();
      }
    };
    
    prepareAvatar();
  }, [avatarCode, address]);

  const sizeClass = `avatar-${size}`;

  return (
    <div className={`avatar ${sizeClass} relative`}>
      <div className={`w-full h-full bg-gray-800 rounded-md absolute top-0 left-0 ${isReady ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}></div>
      
      <img 
        ref={avatarRef}
        alt="Avatar" 
        className={`w-full h-full rounded-md object-cover ${isReady ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      />
    </div>
  );
}

export default Avatar;