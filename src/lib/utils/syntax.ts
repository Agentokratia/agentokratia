/**
 * Safe JSON syntax highlighting utility
 * Properly escapes HTML to prevent XSS attacks
 */

/**
 * Escape HTML entities to prevent XSS
 */
export const escapeHtml = (str: string): string => {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
};

/**
 * Syntax highlight JSON string for display
 * Returns HTML string safe for use with dangerouslySetInnerHTML
 *
 * Security: Validates JSON before highlighting to prevent XSS attacks.
 * Malformed JSON is escaped but not highlighted.
 *
 * @param json - JSON string to highlight
 * @returns HTML string with syntax highlighting classes
 */
export const highlightJson = (json: string): string => {
  if (!json) return '';

  try {
    // Parse and re-stringify to validate and normalize JSON
    // This ensures we're only highlighting valid JSON structures
    const parsed = JSON.parse(json);
    const normalized = JSON.stringify(parsed, null, 2);

    // Escape all HTML entities in the normalized JSON
    const escaped = escapeHtml(normalized);

    // Apply syntax highlighting with CSS classes
    return (
      escaped
        // Highlight keys (property names)
        .replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
        // Highlight string values
        .replace(/: "([^"]*)"/g, ': <span class="string">"$1"</span>')
        // Highlight numbers
        .replace(/: (-?\d+\.?\d*)/g, ': <span class="number">$1</span>')
        // Highlight booleans
        .replace(/: (true|false)/g, ': <span class="bool">$1</span>')
        // Highlight null
        .replace(/: (null)/g, ': <span class="null">$1</span>')
    );
  } catch {
    // If JSON is invalid, return escaped version without highlighting
    // This prevents any potential XSS through malformed input
    return escapeHtml(json);
  }
};

/**
 * HTTP status code descriptions
 */
export const HTTP_STATUS_CODES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/**
 * Get human-readable status text for HTTP status code
 */
export const getHttpStatusText = (status: number): string => {
  return HTTP_STATUS_CODES[status] ?? 'Unknown';
};

/**
 * Format HTTP status with code and text
 */
export const formatHttpStatus = (status: number): string => {
  const text = getHttpStatusText(status);
  return `${status} ${text}`;
};

/**
 * Safely render HTTP headers with syntax highlighting
 * Escapes all header keys and values to prevent XSS
 */
export const highlightHeaders = (headers: Record<string, string>): string => {
  return Object.entries(headers)
    .map(([key, value]) => `<span class="key">${escapeHtml(key)}</span>: ${escapeHtml(value)}`)
    .join('\n');
};
