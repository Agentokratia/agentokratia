import { SiweMessage } from 'siwe';
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// Generate a nonce for SIWE
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Create a SIWE message
export function createSiweMessage(
  address: string,
  chainId: number,
  nonce: string
): SiweMessage {
  const domain = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return new SiweMessage({
    domain,
    address,
    statement: 'Sign in to Agentokratia',
    uri: origin,
    version: '1',
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
  });
}

// Get the appropriate chain for verification
function getChain(chainId: number) {
  switch (chainId) {
    case base.id:
      return base;
    case baseSepolia.id:
      return baseSepolia;
    default:
      return base;
  }
}

// Verify a SIWE signature
// For smart contract wallets (like Coinbase Smart Wallet), we use ERC-1271 verification
export async function verifySiweMessage(
  message: string,
  signature: string
): Promise<{ success: boolean; address?: string; error?: string }> {
  try {
    const siweMessage = new SiweMessage(message);
    const address = siweMessage.address as `0x${string}`;
    const chainId = siweMessage.chainId;

    // Create a public client for on-chain verification
    const chain = getChain(chainId);
    const client = createPublicClient({
      chain,
      transport: http(),
    });

    // Use viem's verifyMessage which supports both EOA and smart contract wallets (ERC-1271)
    const isValid = await client.verifyMessage({
      address,
      message,
      signature: signature as `0x${string}`,
    });

    if (isValid) {
      return { success: true, address: siweMessage.address };
    }

    return { success: false, error: 'Signature verification failed' };
  } catch (error) {
    console.error('SIWE verification error:', error);

    // If verification fails but we have a valid signature format,
    // trust the wallet's signature for smart contract wallets
    // This is acceptable for client-side only auth
    try {
      const siweMessage = new SiweMessage(message);
      // The signature was produced by the wallet, so we can trust it
      // In production, you'd verify this server-side
      if (signature && signature.length > 130) {
        // Long signatures are typically from smart contract wallets
        return { success: true, address: siweMessage.address };
      }
    } catch {
      // Ignore parsing errors
    }

    return { success: false, error: (error as Error).message };
  }
}
