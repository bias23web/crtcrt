# crkcrk - Decentralized Blockchain Messaging Platform

A minimalist, decentralized messaging platform built on the Reactive Network blockchain. Think of it as "one famous social network with bird" distilled to its essence, with all data stored transparently on-chain.

## Features

- **On-chain messaging**: All messages are stored directly on the blockchain
- **User profiles**: Create a unique nickname and avatar
- **Message replies**: Reply to existing messages
- **Self-pruning system**: Limited to 500 active messages at any time
- **Terminal-inspired UI**: Clean, minimal interface

## Demo

Visit the live demo at [crkcrk.com](https://crkcrk.com)

## Local Development Setup

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- MetaMask or compatible Ethereum wallet
- Access to Reactive Network RPC (for blockchain interaction)

### Backend Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/crkcrk.git
   cd crkcrk
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:
   ```
   CONTRACT_ADDRESS=0xYourContractAddressHere
   RPC_URL=https://mainnet-rpc.rnk.dev/
   PORT=3000
   ```

4. Start the backend server:
   ```bash
   npm run dev:backend
   ```

   The server will start on `http://localhost:3000`

### Frontend Setup

1. In a new terminal, start the frontend development server:
   ```bash
   npm run dev:frontend
   ```

   The Vite development server will start on `http://localhost:5173`

2. Frontend Environment Variables
    For the frontend to communicate with your contract and backend server, you'll need to create a .env file in the project root with the following variables:
    ```
    # Backend connection
    VITE_API_URL=http://localhost:3000
    VITE_WS_URL=ws://localhost:3000

    # Blockchain connection
    VITE_CONTRACT_ADDRESS=0xYourContractAddressHere
    VITE_RPC_URL=https://mainnet-rpc.rnk.dev/
    ```

3. Open your browser and navigate to `http://localhost:5173`

### Connecting to the Blockchain

1. Open MetaMask and ensure you're connected to the Reactive Network
   - Network Name: Reactive Network
   - RPC URL: https://mainnet-rpc.rnk.dev/
   - Chain ID: 12553
   - Currency Symbol: REACT

2. Create a profile by clicking on "Connect Wallet" and following the prompts

3. Start posting messages!

## Project Structure

```
crkcrk/
├── dist/                  # Build output
├── src/                   # Frontend source code
│   ├── components/        # React components
│   ├── contexts/          # React contexts
│   ├── hooks/             # Custom React hooks
│   ├── pages/             # App pages
│   └── utils/             # Utility functions
├── contractABI.json       # Smart contract ABI
├── server.js              # Backend server
└── package.json           # Project configuration
```

## Available Scripts

- `npm run dev:frontend` - Start the frontend development server
- `npm run dev:backend` - Start the backend server
- `npm run build` - Build the frontend for production
- `npm start` - Start the production server

## Smart Contract

The messaging platform is powered by a Solidity smart contract deployed on the Reactive Network. The contract handles:

- User profile management
- Message posting and retrieval
- Reply functionality
- Message pruning when the 500 message limit is reached

View the contract code in `ReactiveTwitter.sol` for implementation details.

## Known Limitations

- Maximum message length is 768 characters
- There's a 60-second cooldown between messages
- Only 500 active messages can exist at once (oldest get pruned)
- Profile nicknames must be unique and only use letters, numbers, and underscores

## Troubleshooting

### Connection Issues

If you have trouble connecting to the Reactive Network:
1. Verify your RPC URL is correct
2. Check that your wallet is properly configured
3. Ensure you have some REACT tokens for gas fees

### Message Posting Issues

If your messages aren't appearing:
1. Check that you've created a profile
2. Ensure your profile is active (not deactivated)
3. Wait for the 60-second cooldown between messages
4. Check the console for error messages

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built on [Reactive Network](https://reactive.network/)
- Inspired by minimalist social platforms
- Thanks to all contributors, testers and cats