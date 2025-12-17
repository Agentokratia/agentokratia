'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useSignMessage, useChainId, useDisconnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/ui';
import { useAuthStore, authApi } from '@/lib/store/authStore';
import { createSiweMessage } from '@/lib/auth/siwe';
import { EXTERNAL_LINKS } from '@/lib/utils/constants';
import styles from './page.module.css';

type SigningState = 'idle' | 'signing' | 'submitting' | 'rejected' | 'error' | 'invite_required';

// Delay before auto-triggering SIWE sign (allows wallet UI to settle)
const SIWE_SIGN_DELAY_MS = 300;

export default function ConnectPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  const { token, walletAddress, setAuth, clearAuth } = useAuthStore();

  const [signingState, setSigningState] = useState<SigningState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [handle, setHandle] = useState<string>('');
  const [pendingAuth, setPendingAuth] = useState<{ message: string; signature: string } | null>(null);
  const isSigningRef = useRef(false);
  const hasInitiatedRef = useRef(false);

  const isAuthenticated = token && walletAddress && walletAddress.toLowerCase() === address?.toLowerCase();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const performSiweSign = useCallback(async () => {
    if (!address || !chainId || isSigningRef.current) return;

    isSigningRef.current = true;
    setSigningState('signing');
    setErrorMessage('');

    try {
      const nonce = await authApi.getNonce();
      const siweMessage = createSiweMessage(address, chainId, nonce);
      const message = siweMessage.prepareMessage();
      const signature = await signMessageAsync({ message });

      try {
        const { token: jwtToken, walletAddress: verifiedAddress } = await authApi.verify(message, signature);
        setAuth(jwtToken, verifiedAddress);
        router.push('/dashboard');
      } catch (verifyErr: unknown) {
        const error = verifyErr as Error & { code?: string };
        if (error.code === 'INVITE_REQUIRED') {
          // New user - reuse the same signature for invite code registration
          setPendingAuth({ message, signature });
          setSigningState('invite_required');
        } else {
          throw verifyErr;
        }
      }
    } catch (err: unknown) {
      console.error('SIWE authentication failed:', err);
      const error = err as Error & { code?: string };
      if (error.message?.includes('rejected') || error.message?.includes('denied') || error.message?.includes('User rejected')) {
        setSigningState('rejected');
      } else {
        setSigningState('error');
        setErrorMessage(error.message || 'Authentication failed');
      }
    } finally {
      isSigningRef.current = false;
    }
  }, [address, chainId, signMessageAsync, setAuth, router]);

  const handleInviteSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAuth || !inviteCode.trim() || !handle.trim()) return;

    setSigningState('submitting');
    setErrorMessage('');

    try {
      const { token: jwtToken, walletAddress: verifiedAddress } = await authApi.verify(
        pendingAuth.message,
        pendingAuth.signature,
        inviteCode.trim(),
        handle.trim()
      );
      setAuth(jwtToken, verifiedAddress);
      router.push('/dashboard');
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'INVALID_INVITE_CODE') {
        setSigningState('invite_required');
        setErrorMessage('Invalid or already used invite code');
      } else if (error.code === 'INVITE_EXPIRED') {
        setSigningState('invite_required');
        setErrorMessage('Your invite code has expired');
      } else if (error.code === 'INVALID_HANDLE') {
        setSigningState('invite_required');
        setErrorMessage(error.message || 'Invalid handle');
      } else if (error.code === 'HANDLE_TAKEN') {
        setSigningState('invite_required');
        setErrorMessage('This handle is already taken');
      } else {
        setSigningState('error');
        setErrorMessage(error.message || 'Registration failed');
      }
    }
  }, [pendingAuth, inviteCode, handle, setAuth, router]);

  useEffect(() => {
    if (isConnected && address && signingState === 'idle') {
      if (isAuthenticated) {
        router.push('/dashboard');
        return;
      }
      // Prevent double-initiation from React Strict Mode or re-renders
      if (hasInitiatedRef.current) return;
      hasInitiatedRef.current = true;

      const timer = setTimeout(() => performSiweSign(), SIWE_SIGN_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (!isConnected) {
      setSigningState('idle');
      hasInitiatedRef.current = false;
      clearAuth();
    }
  }, [isConnected, address, signingState, performSiweSign, clearAuth, isAuthenticated, router]);

  const handleTryAgain = () => {
    hasInitiatedRef.current = false;
    setSigningState('idle');
  };

  const handleDifferentWallet = () => {
    setSigningState('idle');
    disconnect();
  };

  // Signing states
  if (isConnected && signingState === 'signing') {
    return (
      <div className={styles.pageCentered}>
        <div className={styles.card}>
          <Logo size={48} />
          <div className={styles.spinner} />
          <h1 className={styles.cardTitle}>Check your wallet</h1>
          <p className={styles.cardDesc}>Approve the sign-in request to continue</p>
          <p className={styles.cardHint}>Free · No transaction required</p>
        </div>
      </div>
    );
  }

  if (isConnected && signingState === 'submitting') {
    return (
      <div className={styles.pageCentered}>
        <div className={styles.card}>
          <Logo size={48} />
          <div className={styles.spinner} />
          <h1 className={styles.cardTitle}>Creating account</h1>
          <p className={styles.cardDesc}>Just a moment...</p>
        </div>
      </div>
    );
  }

  if (isConnected && signingState === 'rejected') {
    return (
      <div className={styles.pageCentered}>
        <div className={styles.card}>
          <Logo size={48} />
          <h1 className={styles.cardTitle}>Sign-in cancelled</h1>
          <p className={styles.cardDesc}>You declined the signature request</p>
          <div className={styles.cardActions}>
            <button className={styles.btnPrimary} onClick={handleTryAgain}>Try again</button>
            <button className={styles.btnGhost} onClick={handleDifferentWallet}>Use different wallet</button>
          </div>
        </div>
      </div>
    );
  }

  if (isConnected && signingState === 'error') {
    return (
      <div className={styles.pageCentered}>
        <div className={styles.card}>
          <Logo size={48} />
          <h1 className={styles.cardTitle}>Something went wrong</h1>
          <p className={styles.cardDesc}>{errorMessage || "We couldn't verify your wallet"}</p>
          <div className={styles.cardActions}>
            <button className={styles.btnPrimary} onClick={handleTryAgain}>Try again</button>
            <button className={styles.btnGhost} onClick={handleDifferentWallet}>Use different wallet</button>
          </div>
        </div>
      </div>
    );
  }

  if (isConnected && signingState === 'invite_required') {
    return (
      <div className={styles.pageCentered}>
        <div className={styles.card}>
          <Logo size={48} />
          <h1 className={styles.cardTitle}>Complete registration</h1>
          <p className={styles.cardDesc}>
            Enter your invite code and choose your handle
          </p>
          {errorMessage && (
            <p className={styles.cardError}>{errorMessage}</p>
          )}
          <form onSubmit={handleInviteSubmit} className={styles.inviteForm}>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="A7K9X2"
              className={styles.inviteInput}
              required
              autoFocus
              maxLength={6}
            />
            <div className={styles.inputGroup}>
              <span className={styles.inputPrefix}>@</span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="yourhandle"
                className={styles.handleInput}
                required
                maxLength={30}
              />
            </div>
            <button type="submit" className={styles.btnPrimary} disabled={!inviteCode.trim() || !handle.trim()}>
              Continue
            </button>
          </form>
          <p className={styles.cardHint}>
            Your profile will be at /creator/{handle || 'yourhandle'}
          </p>
          <button className={styles.btnGhost} onClick={handleDifferentWallet}>
            Use different wallet
          </button>
        </div>
      </div>
    );
  }

  if (isConnected && signingState === 'idle') {
    return (
      <div className={styles.pageCentered}>
        <div className={styles.card}>
          <Logo size={48} />
          <div className={styles.spinner} />
          <p className={styles.cardDesc}>Connecting...</p>
        </div>
      </div>
    );
  }

  // Landing page - split screen
  return (
    <div className={styles.page}>
      {/* Left - Brand side */}
      <div className={styles.brandSide}>
        <Link href="https://agentokratia.com" className={styles.logo}>
          <Logo size={36} variant="inverted" />
          <span>Agentokratia</span>
        </Link>

        <div className={styles.brandContent}>
          <h1 className={styles.brandTitle}>
            Your API.<br />
            Your rules.<br />
            Your revenue.
          </h1>
          <p className={styles.brandSubtitle}>
            Turn any API into an agent-ready service. Set your price. Get paid in stablecoins.
          </p>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>0%</span>
              <span className={styles.statLabel}>Platform fees</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>2 min</span>
              <span className={styles.statLabel}>Setup time</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>USDC</span>
              <span className={styles.statLabel}>On Base</span>
            </div>
          </div>
        </div>

        <footer className={styles.brandFooter}>
          <a href={EXTERNAL_LINKS.TERMS}>Terms</a>
          <a href={EXTERNAL_LINKS.PRIVACY}>Privacy</a>
        </footer>
      </div>

      {/* Right - Connect side */}
      <div className={styles.connectSide}>
        <div className={styles.connectCard}>
          <div className={styles.badge}>Private Beta</div>

          <h2 className={styles.connectTitle}>Get started</h2>
          <p className={styles.connectDesc}>
            Connect your wallet to register APIs and start earning.
          </p>

          <div className={styles.connectAction}>
            <ConnectButton label="Connect Wallet" />
          </div>

          <div className={styles.divider}>
            <span>or</span>
          </div>

          <Link href="/marketplace" className={styles.browseBtn}>
            Browse Marketplace
            <ArrowRight size={16} />
          </Link>

          <p className={styles.walletHelp}>
            <a href={EXTERNAL_LINKS.WHAT_IS_WALLET} target="_blank" rel="noopener noreferrer">
              What is a wallet?
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
