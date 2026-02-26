import { CONFIG } from '../constants/config';

const isAbsoluteUri = (value) => /^(https?:|file:|content:|data:|asset:)/i.test(value);

const getApiOrigin = () => {
  const base = String(CONFIG.API.BASE_URL || '').replace(/\/+$/, '');
  // API routes are under /api; uploaded files are served from /uploads at server root.
  return base.replace(/\/api$/i, '');
};

export const resolveMediaUri = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (isAbsoluteUri(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\\/g, '/');
  let relativePath = normalized;

  const publicUploadsMarker = '/public/uploads/';
  const markerIndex = normalized.toLowerCase().lastIndexOf(publicUploadsMarker);
  if (markerIndex !== -1) {
    relativePath = `/uploads/${normalized.slice(markerIndex + publicUploadsMarker.length)}`;
  }

  // Handle file paths persisted with a public prefix.
  if (relativePath.startsWith('public/uploads/')) {
    relativePath = relativePath.replace(/^public\/uploads\//, '/uploads/');
  } else if (relativePath.startsWith('uploads/')) {
    relativePath = `/${relativePath}`;
  }

  const origin = getApiOrigin();
  if (!origin) {
    return relativePath;
  }

  if (relativePath.startsWith('/')) {
    return `${origin}${relativePath}`;
  }

  return `${origin}/${relativePath}`;
};

