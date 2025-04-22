export function createAvatar(address) {
    // return `https://avatars.dicebear.com/api/identicon/${address}.svg`;
    return `https://api.dicebear.com/9.x/identicon/svg?seed=${address}`;
    
  }