// EIP-8004 feedbackAuth Signing Utility
// Signs authorization for users to submit feedback after successful payments

import { keccak256, encodeAbiParameters, concat } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { generatePrivateKey } from 'viem/accounts';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// =============================================
// Types
// =============================================

export interface FeedbackAuthData {
  agentId: bigint;
  clientAddress: `0x${string}`;
  indexLimit: bigint;
  expiry: bigint;
  chainId: bigint;
  identityRegistry: `0x${string}`;
  signerAddress: `0x${string}`;
}

export interface FeedbackAuthResult {
  feedbackAuth: `0x${string}`;
  data: FeedbackAuthData;
  signature: `0x${string}`;
}

export interface GeneratedKeypair {
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

// =============================================
// Keypair Generation
// =============================================

/**
 * Generate a new keypair for feedback signing
 * This is called during agent publishing to create a dedicated signer
 */
export function generateFeedbackSignerKeypair(): GeneratedKeypair {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  return {
    address: account.address,
    privateKey: privateKey,
  };
}

// =============================================
// feedbackAuth Signing
// =============================================

/**
 * Sign a feedbackAuth tuple for a payment
 * This authorizes the payer to submit one review for the agent
 *
 * @param data - The feedbackAuth data to sign
 * @param privateKey - The signer's private key (platform's feedback signer for this agent)
 * @returns The encoded feedbackAuth bytes
 */
export async function signFeedbackAuth(
  data: FeedbackAuthData,
  privateKey: `0x${string}`
): Promise<FeedbackAuthResult> {
  const signer = privateKeyToAccount(privateKey);

  // Verify signer address matches
  if (signer.address.toLowerCase() !== data.signerAddress.toLowerCase()) {
    throw new Error('Signer address does not match private key');
  }

  // Create struct hash using abi.encode (NOT encodePacked!)
  // This must match exactly what the contract's _hashFeedbackAuth does:
  // bytes32 structHash = keccak256(abi.encode(agentId, clientAddress, indexLimit, expiry, chainId, identityRegistry, signerAddress));
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { name: 'agentId', type: 'uint256' },
        { name: 'clientAddress', type: 'address' },
        { name: 'indexLimit', type: 'uint64' },
        { name: 'expiry', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
        { name: 'identityRegistry', type: 'address' },
        { name: 'signerAddress', type: 'address' },
      ],
      [
        data.agentId,
        data.clientAddress,
        data.indexLimit,
        data.expiry,
        data.chainId,
        data.identityRegistry,
        data.signerAddress,
      ]
    )
  );

  // Sign the struct hash using EIP-191 personal sign
  // The contract applies the EIP-191 prefix: keccak256("\x19Ethereum Signed Message:\n32" + structHash)
  const signature = await signer.signMessage({
    message: { raw: structHash },
  });

  // Encode the struct fields (7 × 32 bytes = 224 bytes)
  // Must match contract's abi.decode: (uint256, address, uint64, uint256, uint256, address, address)
  const structEncoded = encodeAbiParameters(
    [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
      { name: 'indexLimit', type: 'uint64' },
      { name: 'expiry', type: 'uint256' },
      { name: 'chainId', type: 'uint256' },
      { name: 'identityRegistry', type: 'address' },
      { name: 'signerAddress', type: 'address' },
    ],
    [
      data.agentId,
      data.clientAddress,
      data.indexLimit,
      data.expiry,
      data.chainId,
      data.identityRegistry,
      data.signerAddress,
    ]
  );

  // Concatenate struct bytes + raw signature bytes (NOT ABI-encoded!)
  // Contract expects: [224 bytes struct][65 bytes signature: r=32, s=32, v=1]
  // Total: 289 bytes minimum
  const feedbackAuth = concat([structEncoded, signature]);

  return {
    feedbackAuth,
    data,
    signature,
  };
}

// =============================================
// Helper Functions
// =============================================

/**
 * Calculate the expiry timestamp (default: 30 minutes from now)
 */
export function calculateExpiry(minutesValid = 30): bigint {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + minutesValid * 60;
  return BigInt(expiry);
}

/**
 * Build FeedbackAuthData for a payment
 */
export function buildFeedbackAuthData(params: {
  agentId: string | bigint;
  clientAddress: `0x${string}`;
  currentFeedbackIndex: number | bigint;
  chainId: number | bigint;
  identityRegistryAddress: `0x${string}`;
  signerAddress: `0x${string}`;
  expiryMinutes?: number;
}): FeedbackAuthData {
  return {
    agentId: BigInt(params.agentId),
    clientAddress: params.clientAddress,
    // indexLimit = current count + 1 (allow exactly one more review)
    indexLimit: BigInt(params.currentFeedbackIndex) + BigInt(1),
    expiry: calculateExpiry(params.expiryMinutes ?? 5),
    chainId: BigInt(params.chainId),
    identityRegistry: params.identityRegistryAddress,
    signerAddress: params.signerAddress,
  };
}

/**
 * Create a signed feedbackAuth for a payment
 * This is the main function called after a successful x402 payment
 */
export async function createFeedbackAuth(params: {
  agentId: string | bigint;
  clientAddress: `0x${string}`;
  currentFeedbackIndex: number | bigint;
  chainId: number | bigint;
  identityRegistryAddress: `0x${string}`;
  signerAddress: `0x${string}`;
  signerPrivateKey: `0x${string}`;
  expiryMinutes?: number;
}): Promise<FeedbackAuthResult> {
  const data = buildFeedbackAuthData({
    agentId: params.agentId,
    clientAddress: params.clientAddress,
    currentFeedbackIndex: params.currentFeedbackIndex,
    chainId: params.chainId,
    identityRegistryAddress: params.identityRegistryAddress,
    signerAddress: params.signerAddress,
    expiryMinutes: params.expiryMinutes,
  });

  return signFeedbackAuth(data, params.signerPrivateKey);
}

// =============================================
// Encryption helpers - AES-256-GCM with env secret
// =============================================

const ENCRYPTION_PREFIX = 'enc:v2:'; // v2 = AES-256-GCM
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const secret = process.env.FEEDBACK_SIGNER_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('FEEDBACK_SIGNER_ENCRYPTION_KEY must be set');
  }
  // Convert to Buffer and check byte length (not string length)
  const keyBuffer = Buffer.from(secret, 'utf-8');
  if (keyBuffer.length < 32) {
    throw new Error('FEEDBACK_SIGNER_ENCRYPTION_KEY must be at least 32 bytes');
  }
  // Use first 32 bytes for AES-256
  return keyBuffer.subarray(0, 32);
}

/**
 * Encrypt private key using AES-256-GCM
 * Format: enc:v2:<iv>:<authTag>:<ciphertext> (all base64)
 */
export function encryptPrivateKey(privateKey: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96 bits for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt private key
 */
export function decryptPrivateKey(encrypted: string): `0x${string}` {
  if (!encrypted.startsWith(ENCRYPTION_PREFIX)) {
    throw new Error('Invalid encrypted key format');
  }

  const parts = encrypted.slice(ENCRYPTION_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key structure');
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  const result = decrypted.toString('utf-8');

  if (!result.startsWith('0x')) {
    throw new Error('Invalid decrypted key format');
  }

  return result as `0x${string}`;
}
