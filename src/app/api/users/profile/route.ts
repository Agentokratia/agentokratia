import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DbUser } from '@/lib/db/supabase';
import { verifyToken, hashToken } from '@/lib/auth/jwt';

async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const payload = await verifyToken(token);

  if (!payload) {
    return null;
  }

  // Verify session
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

  return { userId: payload.sub, address: payload.address };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: userData, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', auth.userId)
      .single();

    if (error || !userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = userData as DbUser;

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { handle, email, name, bio } = body;

    // Validate handle format if provided
    if (handle !== undefined) {
      if (handle && !/^[a-zA-Z0-9_]{3,30}$/.test(handle)) {
        return NextResponse.json(
          { error: 'Handle must be 3-30 alphanumeric characters or underscores' },
          { status: 400 }
        );
      }

      // Check if handle is already taken (by another user)
      if (handle) {
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('handle', handle.toLowerCase())
          .neq('id', auth.userId)
          .single();

        if (existingUser) {
          return NextResponse.json(
            { error: 'Handle is already taken' },
            { status: 409 }
          );
        }
      }
    }

    // Validate email format if provided
    if (email !== undefined && email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updates: Record<string, string | null> = {};
    if (handle !== undefined) updates.handle = handle ? handle.toLowerCase() : null;
    if (email !== undefined) updates.email = email || null;
    if (name !== undefined) updates.name = name || null;
    if (bio !== undefined) updates.bio = bio || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data: updatedUserData, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', auth.userId)
      .select()
      .single();

    if (error || !updatedUserData) {
      console.error('Update profile error:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    const updatedUser = updatedUserData as DbUser;

    return NextResponse.json({
      id: updatedUser.id,
      walletAddress: updatedUser.wallet_address,
      handle: updatedUser.handle,
      email: updatedUser.email,
      name: updatedUser.name,
      bio: updatedUser.bio,
      avatarUrl: updatedUser.avatar_url,
      isWhitelisted: updatedUser.is_whitelisted,
      createdAt: updatedUser.created_at,
      updatedAt: updatedUser.updated_at,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
