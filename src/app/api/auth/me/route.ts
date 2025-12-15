import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DbUser, DbUserSession } from '@/lib/db/supabase';
import { verifyToken, hashToken } from '@/lib/auth/jwt';

export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Verify session is still valid (not revoked)
    const tokenHash = hashToken(token);
    const { data: sessionData } = await supabaseAdmin
      .from('user_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!sessionData) {
      return NextResponse.json(
        { error: 'Session expired or revoked' },
        { status: 401 }
      );
    }

    // Get user
    const { data: userData, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', payload.sub)
      .single();

    if (error || !userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = userData as DbUser;

    return NextResponse.json({
      user: {
        id: user.id,
        walletAddress: user.wallet_address,
        handle: user.handle,
        email: user.email,
        name: user.name,
        bio: user.bio,
        avatarUrl: user.avatar_url,
        isWhitelisted: user.is_whitelisted,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
