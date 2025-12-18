/**
 * Converts text to a URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Validates a user handle
 * Rules: 3-30 chars, alphanumeric + underscore only
 */
export function validateHandle(handle: string): { valid: boolean; error?: string } {
  if (!handle) {
    return { valid: false, error: 'Handle is required' };
  }
  if (handle.length < 3) {
    return { valid: false, error: 'Handle must be at least 3 characters' };
  }
  if (handle.length > 30) {
    return { valid: false, error: 'Handle must be 30 characters or less' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(handle)) {
    return { valid: false, error: 'Handle can only contain letters, numbers, and underscores' };
  }
  // Reserved handles
  const reserved = [
    'admin',
    'api',
    'creator',
    'dashboard',
    'marketplace',
    'settings',
    'login',
    'logout',
    'signup',
    'auth',
  ];
  if (reserved.includes(handle.toLowerCase())) {
    return { valid: false, error: 'This handle is reserved' };
  }
  return { valid: true };
}

/**
 * Validates an agent slug
 * Rules: 2-100 chars, lowercase alphanumeric + hyphens only
 */
export function validateSlug(slug: string): { valid: boolean; error?: string } {
  if (!slug) {
    return { valid: false, error: 'Slug is required' };
  }
  if (slug.length < 2) {
    return { valid: false, error: 'Slug must be at least 2 characters' };
  }
  if (slug.length > 100) {
    return { valid: false, error: 'Slug must be 100 characters or less' };
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { valid: false, error: 'Slug can only contain lowercase letters, numbers, and hyphens' };
  }
  if (slug.startsWith('-') || slug.endsWith('-')) {
    return { valid: false, error: 'Slug cannot start or end with a hyphen' };
  }
  return { valid: true };
}
