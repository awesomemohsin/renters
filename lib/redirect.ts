/**
 * Validates and sanitizes a post-login redirect path.
 * Guarantees that the destination is strictly an internal, relative path.
 * Rejects external URLs, protocol-relative URLs (//), backslashes (\),
 * javascript: / data: URI schemes, and encoded bypasses.
 *
 * @param path The candidate redirect path (e.g. from ?from=...)
 * @returns A safe relative internal path starting with '/', defaulting to '/'
 */
export function sanitizeRedirectPath(path: string | null | undefined): string {
  if (!path || typeof path !== 'string') {
    return '/'
  }

  const trimmed = path.trim()
  if (!trimmed) {
    return '/'
  }

  // Reject immediate protocol-relative URLs, backslashes, or non-slash prefixes
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return '/'
  }

  // Attempt URL decoding to catch URL-encoded bypasses (e.g. %2F%2F, %5C)
  let decoded = trimmed
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    // Malformed URI encoding -> reject to '/'
    return '/'
  }

  // Check decoded string for backslashes or protocol-relative slashes
  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) {
    return '/'
  }

  // Check for dangerous URI schemes (e.g. javascript:, data:, vbscript:) after leading slashes
  const withoutLeadingSlashes = decoded.replace(/^\/+/, '')
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(withoutLeadingSlashes)) {
    return '/'
  }

  // Parse relative to a trusted local dummy origin
  try {
    const parsed = new URL(trimmed, 'http://localhost')
    // Must remain strictly on the dummy origin and have a relative pathname
    if (parsed.origin !== 'http://localhost' || !parsed.pathname.startsWith('/')) {
      return '/'
    }
    // Return sanitized pathname + query + hash
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return '/'
  }
}
