'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#FAFAF8',
          color: '#1A1A1A',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            maxWidth: '480px',
            padding: '24px',
          }}
        >
          {/* Logo */}
          <svg
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '48px', height: '48px', marginBottom: '24px' }}
          >
            <path d="M24 6L9 42H17L19 36H29L31 42H39L24 6Z" fill="#1A1A1A" />
            <path d="M24 16L21 28H27L24 16Z" fill="#FAFAF8" />
            <circle cx="13" cy="10" r="2" fill="#1A1A1A" />
            <circle cx="24" cy="5" r="2" fill="#1A1A1A" />
            <circle cx="35" cy="10" r="2" fill="#1A1A1A" />
          </svg>

          <h1
            style={{
              fontSize: '24px',
              fontWeight: 600,
              margin: '0 0 12px 0',
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              fontSize: '16px',
              color: '#6B6B6B',
              margin: '0 0 24px 0',
              lineHeight: 1.6,
            }}
          >
            A critical error occurred. Please try refreshing the page.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#FFFFFF',
                background: '#1A1A1A',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#1A1A1A',
                background: 'transparent',
                border: '1px solid #E5E5E2',
                borderRadius: '8px',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
