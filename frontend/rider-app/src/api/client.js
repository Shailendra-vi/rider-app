import { expireIfCurrent, getRevision, getSession, trackRequest } from '../auth/sessionRuntime';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

export async function request(path, { method = 'GET', body, riderId, signal, publicRequest = false } = {}) {
  if (!BASE_URL) throw new Error('Cannot connect right now. Please try again later.');
  const session = getSession();
  const revision = getRevision();
  if (!publicRequest && (!session || (riderId && session.riderId !== riderId))) throw new ApiError(401, 'AUTH_REQUIRED', 'Please sign in again.');
  const controller = new AbortController();
  const untrack = publicRequest ? () => {} : trackRequest(controller);
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method, signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(!publicRequest && { Authorization: `Bearer ${session.token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!publicRequest && revision !== getRevision()) throw new ApiError(401, 'SESSION_CHANGED', 'Session changed.');
    if (response.status === 204) return null;
    const payload = await response.json();
    if (!publicRequest && revision !== getRevision()) throw new ApiError(401, 'SESSION_CHANGED', 'Session changed.');
    if (!response.ok) {
      if (response.status === 401 && !publicRequest) expireIfCurrent(revision);
      const error = payload?.error || {};
      const retryAfterSeconds = Number(response.headers.get('Retry-After')) || error.details?.retryAfterSeconds;
      throw new ApiError(response.status, error.code, error.message || 'Something went wrong. Please try again.', { ...error.details, retryAfterSeconds });
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      if (revision !== getRevision()) throw new ApiError(401, 'SESSION_CHANGED', 'Session changed.');
      throw Object.assign(new Error('Connection timed out. Check your connection and try again.'), { timedOut: true });
    }
    if (error instanceof TypeError) throw new Error('Unable to connect. Check your internet connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer); untrack(); signal?.removeEventListener('abort', abort);
  }
}

export const authApi = {
  post: (path, body) => request(`/auth/${path}`, { method: 'POST', body, publicRequest: true }),
  logout: () => {
    const session = getSession();
    if (!session) return Promise.resolve();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    return fetch(`${BASE_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal }).finally(() => clearTimeout(timer));
  },
};

export const api = {
  getMe: riderId => request('/rider/me', { riderId }),
  setShift: (riderId, online) => request('/rider/shift', { method: 'POST', riderId, body: { online } }),
  claim: riderId => request('/rider/claim', { method: 'POST', riderId }),
  sendPings: (riderId, pings) => request('/rider/locations', { method: 'POST', riderId, body: { pings } }),
  heartbeat: riderId => request('/rider/heartbeat', { method: 'POST', riderId }),
  transition: (riderId, orderId, to, claimId) => request(`/orders/${orderId}/transitions`, { method: 'POST', riderId, body: { to, claimId } }),
};
