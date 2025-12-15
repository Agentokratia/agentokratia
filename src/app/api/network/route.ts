import { NextResponse } from 'next/server';
import { getAllNetworks } from '@/lib/network';

// GET /api/network - returns all supported networks from DB
export async function GET() {
  try {
    const networks = await getAllNetworks();
    return NextResponse.json(
      networks.map(config => ({
        chainId: config.chainId,
        network: config.network,
        name: config.name,
        rpcUrl: config.rpcUrl,
        identityRegistryAddress: config.identityRegistryAddress,
        reputationRegistryAddress: config.reputationRegistryAddress,
        blockExplorerUrl: config.blockExplorerUrl,
        isTestnet: config.isTestnet,
      }))
    );
  } catch (error) {
    console.error('[Network API] Failed to load networks:', error);
    return NextResponse.json(
      { error: 'Failed to load networks', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 503 }
    );
  }
}
