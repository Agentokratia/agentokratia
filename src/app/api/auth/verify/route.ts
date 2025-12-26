import { NextRequest, NextResponse } from 'next/server';
import { SiweMessage } from 'siwe';
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { supabaseAdmin, DbUser, DbAuthNonce } from '@/lib/db/supabase';
import { createToken, hashToken, getTokenExpiration } from '@/lib/auth/jwt';
import { validateHandle } from '@/lib/utils/slugify';

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

export async function POST(request: NextRequest) {
  try {
    const { message, signature, inviteCode, handle } = await request.json();

    if (!message || !signature) {
      return NextResponse.json({ error: 'Message and signature are required' }, { status: 400 });
    }

    // Parse the SIWE message
    const siweMessage = new SiweMessage(message);
    const { address, nonce, chainId } = siweMessage;

    // Create a public client for on-chain verification (supports ERC-1271 smart contract wallets)
    const chain = getChain(chainId);
    const client = createPublicClient({
      chain,
      transport: http(),
    });

    // Verify signature - viem's verifyMessage supports both EOA and smart contract wallets
    let isValid = false;
    try {
      isValid = await client.verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
    } catch (verifyError) {
      console.error('On-chain verification error:', verifyError);

      // Fallback: try standard SIWE verification for EOA wallets
      try {
        const fields = await siweMessage.verify({ signature });
        isValid = fields.success;
      } catch {
        // If both fail, the signature is invalid
        isValid = false;
      }
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const normalizedAddress = address.toLowerCase();

    // Verify nonce exists and hasn't expired
    const { data: nonceRecord, error: nonceError } = await supabaseAdmin
      .from('auth_nonces')
      .select('*')
      .eq('nonce', nonce)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (nonceError || !nonceRecord) {
      return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 401 });
    }

    const nonceData = nonceRecord as DbAuthNonce;

    // Find or create user
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('wallet_address', normalizedAddress)
      .single();

    let user: DbUser;

    if (!existingUser) {
      // NEW USER - require invite code and handle (bypass invite in development)
      const bypassInvite = process.env.NODE_ENV === 'development';

      // Always need a handle for new users
      if (!handle) {
        return NextResponse.json(
          { error: 'Handle required for registration', code: 'INVITE_REQUIRED' },
          { status: 403 }
        );
      }

      // In production, also need invite code
      if (!bypassInvite && !inviteCode) {
        return NextResponse.json(
          { error: 'Invite code required for registration', code: 'INVITE_REQUIRED' },
          { status: 403 }
        );
      }

      const normalizedHandle = handle.toLowerCase().trim();

      // Validate handle format
      const handleValidation = validateHandle(normalizedHandle);
      if (!handleValidation.valid) {
        return NextResponse.json(
          { error: handleValidation.error, code: 'INVALID_HANDLE' },
          { status: 400 }
        );
      }

      if (bypassInvite) {
        // Dev mode: create user directly without invite
        const { data: existingHandle } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('handle', normalizedHandle)
          .single();

        if (existingHandle) {
          return NextResponse.json(
            { error: 'Handle already taken', code: 'HANDLE_TAKEN' },
            { status: 400 }
          );
        }

        const { data: newUser, error: createError } = await supabaseAdmin
          .from('users')
          .insert({
            wallet_address: normalizedAddress,
            handle: normalizedHandle,
            is_whitelisted: true,
            whitelisted_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createError || !newUser) {
          console.error('Failed to create user:', createError);
          return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
        }

        user = newUser as DbUser;
      } else {
        // Production: use invite code flow
        const normalizedInviteCode = inviteCode.toUpperCase().trim();

        // Atomic registration: validate invite, create user, claim invite in single transaction
        interface RegisterResult {
          user_id: string | null;
          user_email: string | null;
          error_code: string | null;
          error_message: string | null;
        }

        const { data: result, error: rpcError } = await supabaseAdmin
          .rpc('register_user_with_invite', {
            p_wallet_address: normalizedAddress,
            p_handle: normalizedHandle,
            p_invite_code: normalizedInviteCode,
          })
          .single<RegisterResult>();

        if (rpcError || !result) {
          console.error('Registration RPC error:', rpcError);
          return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
        }

        // Check for business logic errors from the function
        if (result.error_code) {
          const statusCode = result.error_code === 'HANDLE_TAKEN' ? 400 : 403;
          return NextResponse.json(
            { error: result.error_message, code: result.error_code },
            { status: statusCode }
          );
        }

        // Fetch the created user
        const { data: newUser, error: fetchError } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('id', result.user_id)
          .single();

        if (fetchError || !newUser) {
          console.error('Failed to fetch created user:', fetchError);
          return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
        }

        user = newUser as DbUser;
      }
    } else {
      user = existingUser as DbUser;
    }

    // Mark nonce as used only after successful authentication
    const { error: nonceUpdateError } = await supabaseAdmin
      .from('auth_nonces')
      .update({ used_at: new Date().toISOString(), wallet_address: normalizedAddress })
      .eq('id', nonceData.id);

    if (nonceUpdateError) {
      // Log but don't fail - nonce has expiration anyway
      console.error('Failed to mark nonce as used:', nonceUpdateError);
    }

    // Create JWT token
    const token = await createToken(user.id, normalizedAddress);
    const tokenHash = hashToken(token);
    const expiresAt = getTokenExpiration();

    // Store session
    const { error: sessionError } = await supabaseAdmin.from('user_sessions').insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      user_agent: request.headers.get('user-agent'),
    });

    if (sessionError) {
      console.error('Failed to create session:', sessionError);
    }

    return NextResponse.json({
      token,
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
      },
    });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
