-- Atomic user registration with invite code claim
-- Ensures user creation and invite claim happen together or not at all

CREATE OR REPLACE FUNCTION register_user_with_invite(
  p_wallet_address TEXT,
  p_handle TEXT,
  p_invite_code TEXT
)
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  error_code TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite RECORD;
  v_new_user RECORD;
  v_existing_handle UUID;
BEGIN
  -- Check handle uniqueness first (before locking invite)
  SELECT id INTO v_existing_handle FROM users WHERE handle = p_handle;
  IF v_existing_handle IS NOT NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'HANDLE_TAKEN'::TEXT, 'Handle already taken'::TEXT;
    RETURN;
  END IF;

  -- Lock and fetch invite in one atomic operation
  SELECT * INTO v_invite
  FROM whitelist_invites
  WHERE invite_code = p_invite_code
    AND claimed_by IS NULL
  FOR UPDATE SKIP LOCKED;  -- Skip if another transaction is claiming

  IF v_invite IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'INVALID_INVITE_CODE'::TEXT, 'Invalid or already used invite code'::TEXT;
    RETURN;
  END IF;

  -- Check expiration
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'INVITE_EXPIRED'::TEXT, 'Invite code has expired'::TEXT;
    RETURN;
  END IF;

  -- Create user (will fail if wallet_address already exists due to unique constraint)
  INSERT INTO users (wallet_address, email, handle, is_whitelisted, whitelisted_at, invited_by)
  VALUES (p_wallet_address, v_invite.email, p_handle, true, NOW(), v_invite.invited_by)
  RETURNING * INTO v_new_user;

  -- Claim the invite
  UPDATE whitelist_invites
  SET claimed_by = v_new_user.id, claimed_at = NOW()
  WHERE id = v_invite.id;

  -- Return success
  RETURN QUERY SELECT v_new_user.id, v_new_user.email, NULL::TEXT, NULL::TEXT;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION register_user_with_invite TO service_role;
