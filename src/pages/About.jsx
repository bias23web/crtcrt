// src/pages/About.jsx
import React from 'react';
import MarkdownRenderer from '../components/MarkdownRenderer';

function About() {
  return (
    <div className="max-w-2xl mx-auto p-6 my-12 inset-ring rounded-xl inset-ring-white/10">      
      <div className="prose prose-invert prose-sm max-w-none font-mono break-words">
        <MarkdownRenderer markdown={markdownContent} />
      </div>
    </div>
  );
}

// Markdown content as a string
const markdownContent = `
## What is crkcrk?

**crkcrk** is a decentralized, blockchain-based messaging platform built on the Reactive Network. 
It's a minimalist experiment in on-chain social communication—think of it as like Twitter distilled to its essence, living entirely within a smart contract.

## Core Concept

Unlike traditional social media platforms where your data is stored on centralized servers, crkcrk stores all messages directly on the blockchain. This means:

* Your messages are **immutable** (though can be soft-deleted)
* The platform is **censorship-resistant**
* Everything is **transparent** and verifiable
* No company controls your data

## How It Works

The platform operates with an intentional constraint: only 500 active messages can exist at any time. 
When this limit is reached, the oldest messages are automatically pruned. This creates a dynamic, ever-evolving timeline—a snapshot of the current conversation rather than an infinite archive.

### Key Features:

* **Profiles**: Create a nickname and avatar that's stored on-chain
* **Messages**: Post public messages (max 768 characters)
* **Replies**: Respond directly to messages
* **Self-pruning**: The timeline automatically removes oldest content
* **Message formatting**: Monospace text with fixed-width characters

## Technical Details

crkcrk runs entirely on a single smart contract deployed on the Reactive Network. The contract:

* Manages user profiles and message storage
* Handles message posting, replying, and deletion
* Maintains efficient data structures for message retrieval
* Enforces platform limits and cooldowns

The front-end is built with React, utilizing Web3 technologies to interact with the blockchain.
It's designed to be lightweight and responsive, with a terminal-inspired aesthetic.

## Why "crkcrk"?

The name references the distinctive sound of classic mechanical keyboards—a nod to the platform's text-centric, terminal-inspired design. It's meant to evoke a sense of directness and simplicity in digital communication.

## Core Philosophy

crkcrk embodies three key principles:

* **Ephemerality**: Nothing lasts forever; the timeline constantly evolves
* **Minimalism**: Focus on text and ideas rather than algorithms and engagement metrics
* **Decentralization**: No single entity controls the platform

## Getting Started

To participate in crkcrk, you'll need:

1. A wallet compatible with Reactive Network (like MetaMask)
2. A small amount of REACT tokens for gas fees (0.0001 - 0.0008 REACT per transaction)
3. A unique nickname (letters, numbers, and underscores only)

Once connected, you can create a profile and start posting immediately. Every action (posting, replying, profile changes) is a blockchain transaction that requires a small gas fee.

## Support the Project

This project is maintained independently without any external funding. Server costs, domain renewals, and development time are all contributed out-of-pocket. If you find crkcrk valuable, please consider supporting its continued operation with a donation:

* **ETH/REACT**: [0xfeB5BfeEC91998845B1fb5588Fc721e4653ED1D6](https://etherscan.io/address/0xfeB5BfeEC91998845B1fb5588Fc721e4653ED1D6)

Your support helps keep the servers running and enables future improvements to the platform. 
Thank you for being part of this experiment in decentralized communication!

## Future Development

While crkcrk embraces simplicity, potential future enhancements might include:

* Profile verification mechanisms
* Enhanced message formatting options
* Delegate posting (allowing others to post on your behalf)
* Integration with other on-chain identity systems

However, the core constraint—limited message capacity—will remain as the defining characteristic of the platform.
`;

export default About;