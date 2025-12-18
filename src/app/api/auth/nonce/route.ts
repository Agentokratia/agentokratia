import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/db/supabase';

export async function GET() {
  try {
    // Generate a random nonce
    const nonce = randomBytes(32).toString('hex');

    // Set expiration to 5 minutes from now
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    // Store nonce in database
    const { error } = await supabaseAdmin.from('auth_nonces').insert({
      nonce,
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      console.error('Failed to store nonce:', error);
      return NextResponse.json({ error: 'Failed to generate nonce' }, { status: 500 });
    }

    return NextResponse.json({ nonce });
  } catch (error) {
    console.error('Nonce generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
