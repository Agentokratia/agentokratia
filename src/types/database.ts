export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          wallet_address: string;
          handle: string | null;
          email: string | null;
          name: string | null;
          bio: string | null;
          avatar_url: string | null;
          is_whitelisted: boolean;
          whitelisted_at: string | null;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          handle?: string | null;
          email?: string | null;
          name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          is_whitelisted?: boolean;
          whitelisted_at?: string | null;
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          handle?: string | null;
          email?: string | null;
          name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          is_whitelisted?: boolean;
          whitelisted_at?: string | null;
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      auth_nonces: {
        Row: {
          id: string;
          nonce: string;
          wallet_address: string | null;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          nonce: string;
          wallet_address?: string | null;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          nonce?: string;
          wallet_address?: string | null;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
      };
      user_sessions: {
        Row: {
          id: string;
          user_id: string;
          token_hash: string;
          expires_at: string;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          token_hash: string;
          expires_at: string;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          token_hash?: string;
          expires_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
      };
      whitelist_invites: {
        Row: {
          id: string;
          email: string;
          invited_by: string | null;
          invite_code: string;
          claimed_by: string | null;
          claimed_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          invited_by?: string | null;
          invite_code: string;
          claimed_by?: string | null;
          claimed_at?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          invited_by?: string | null;
          invite_code?: string;
          claimed_by?: string | null;
          claimed_at?: string | null;
          expires_at?: string;
          created_at?: string;
        };
      };
    };
  };
}
