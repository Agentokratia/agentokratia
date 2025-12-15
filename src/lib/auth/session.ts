import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { verifyToken, hashToken } from '@/lib/auth/jwt';

export interface AuthenticatedUser {
  userId: string;
  address: string;
}

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const payload = await verifyToken(token);

  if (!payload) {
    return null;
  }

  // Verify session is still valid (not revoked)
  const tokenHash = hashToken(token);
  const { data: session } = await supabaseAdmin
    .from('user_sessions')
    .select('*')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!session) {
    return null;
  }

  return { userId: payload.sub as string, address: payload.address as string };
}
