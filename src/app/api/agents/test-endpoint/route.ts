import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';

// SSRF protection - block internal/private IPs
function isInternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return true;
    }

    // Block private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
    ];

    if (privateRanges.some(r => r.test(hostname))) {
      return true;
    }

    // Block internal hostnames
    const blockedHosts = ['metadata', 'metadata.google', 'instance-data'];
    if (blockedHosts.some(h => hostname.includes(h))) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

// POST /api/agents/test-endpoint - Test an endpoint with actual payload
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { url, payload } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({
        success: false,
        error: 'Only HTTP/HTTPS URLs are supported'
      });
    }

    // SSRF protection
    if (isInternalUrl(url)) {
      return NextResponse.json({
        success: false,
        error: 'Internal URLs are not allowed'
      });
    }

    // Attempt to reach the endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agentokratia-Test': 'true',
        },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Try to get response body
      let responseBody: unknown = null;
      const contentType = response.headers.get('content-type');
      try {
        if (contentType?.includes('application/json')) {
          responseBody = await response.json();
        } else {
          const text = await response.text();
          // Try to parse as JSON anyway
          try {
            responseBody = JSON.parse(text);
          } catch {
            responseBody = text.slice(0, 1000); // Limit text response
          }
        }
      } catch {
        responseBody = null;
      }

      return NextResponse.json({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        reachable: true,
        response: responseBody,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';

      if (errorMessage.includes('aborted')) {
        return NextResponse.json({
          success: false,
          error: 'Request timed out after 30 seconds',
          reachable: false,
        });
      }

      return NextResponse.json({
        success: false,
        error: `Could not reach endpoint: ${errorMessage}`,
        reachable: false,
      });
    }
  } catch (error) {
    console.error('Test endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
