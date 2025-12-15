// ERC-8004 Identity and Reputation Registry Contracts
// Contract addresses loaded from DB via /lib/network

// Identity Registry ABI (minimal - only what we need)
export const IDENTITY_REGISTRY_ABI = [
  // Events
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { indexed: true, name: 'agentId', type: 'uint256' },
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: false, name: 'tokenURI', type: 'string' },
    ],
  },
  // Register new agent
  {
    type: 'function',
    name: 'register',
    inputs: [{ name: 'tokenURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  // ERC-721 standard
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenURI',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  // ERC-721 operator approval (standard - for delegated feedback signing)
  {
    type: 'function',
    name: 'setApprovalForAll',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  // ERC-721 ApprovalForAll event
  {
    type: 'event',
    name: 'ApprovalForAll',
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'operator', type: 'address' },
      { indexed: false, name: 'approved', type: 'bool' },
    ],
  },
] as const;

// Explorer URLs are now in DB - use getExplorerTxUrl from @/lib/network

// Reputation Registry ABI (EIP-8004)
export const REPUTATION_REGISTRY_ABI = [
  // Events
  {
    type: 'event',
    name: 'NewFeedback',
    inputs: [
      { indexed: true, name: 'agentId', type: 'uint256' },
      { indexed: true, name: 'clientAddress', type: 'address' },
      { indexed: false, name: 'score', type: 'uint8' },
      { indexed: true, name: 'tag1', type: 'bytes32' },
      { indexed: false, name: 'tag2', type: 'bytes32' },
      { indexed: false, name: 'fileuri', type: 'string' },
      { indexed: false, name: 'filehash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'FeedbackRevoked',
    inputs: [
      { indexed: true, name: 'agentId', type: 'uint256' },
      { indexed: true, name: 'clientAddress', type: 'address' },
      { indexed: true, name: 'feedbackIndex', type: 'uint64' },
    ],
  },
  {
    type: 'event',
    name: 'ResponseAppended',
    inputs: [
      { indexed: true, name: 'agentId', type: 'uint256' },
      { indexed: true, name: 'clientAddress', type: 'address' },
      { indexed: true, name: 'feedbackIndex', type: 'uint64' },
      { indexed: false, name: 'responseUri', type: 'string' },
      { indexed: false, name: 'responseHash', type: 'bytes32' },
    ],
  },
  // Give feedback
  {
    type: 'function',
    name: 'giveFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'score', type: 'uint8' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' },
      { name: 'fileuri', type: 'string' },
      { name: 'filehash', type: 'bytes32' },
      { name: 'feedbackAuth', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Revoke feedback
  {
    type: 'function',
    name: 'revokeFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'feedbackIndex', type: 'uint64' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Append response (agent owner)
  {
    type: 'function',
    name: 'appendResponse',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
      { name: 'feedbackIndex', type: 'uint64' },
      { name: 'responseUri', type: 'string' },
      { name: 'responseHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Get summary (count and average)
  {
    type: 'function',
    name: 'getSummary',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'count', type: 'uint64' },
      { name: 'averageScore', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  // Read single feedback
  {
    type: 'function',
    name: 'readFeedback',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
      { name: 'feedbackIndex', type: 'uint64' },
    ],
    outputs: [
      { name: 'score', type: 'uint8' },
      { name: 'tag1', type: 'bytes32' },
      { name: 'tag2', type: 'bytes32' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'revoked', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  // Get feedback count for a client-agent pair
  {
    type: 'function',
    name: 'getFeedbackCount',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
  },
] as const;

// Predefined tag hashes (keccak256 of tag strings)
export const FEEDBACK_TAGS = {
  fast: '0x' + Buffer.from('fast').toString('hex').padEnd(64, '0'),
  accurate: '0x' + Buffer.from('accurate').toString('hex').padEnd(64, '0'),
  reliable: '0x' + Buffer.from('reliable').toString('hex').padEnd(64, '0'),
  expensive: '0x' + Buffer.from('expensive').toString('hex').padEnd(64, '0'),
  buggy: '0x' + Buffer.from('buggy').toString('hex').padEnd(64, '0'),
  helpful: '0x' + Buffer.from('helpful').toString('hex').padEnd(64, '0'),
  slow: '0x' + Buffer.from('slow').toString('hex').padEnd(64, '0'),
} as const;

// Empty bytes32 for optional tags
export const EMPTY_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
