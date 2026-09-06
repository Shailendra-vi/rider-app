const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}



export async function request(path, { method = 'GET', body, riderId, signal } = {}) {
  if (!BASE_URL) throw new Error('EXPO_PUBLIC_API_URL is not set — see .env.example');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => controller.abort());

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 
          'Content-Type': 'application/json' 
        } : {}),
        ...(riderId ? { 
          'X-Rider-Id': riderId 
        } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (res.status === 204) return null;

    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const err = payload?.error ?? {};
      throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? `HTTP ${res.status}`, err.details);
    }
    return payload;
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeout = new Error('Request timed out');
      timeout.timedOut = true;
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => request('/health'),
  listRiders: () => request('/riders'),
  getMe: (riderId) => request('/rider/me', { 
    riderId 
  }),
  setShift: (riderId, online) => request('/rider/shift', { 
    method: 'POST', 
    riderId, 
    body: { 
      online 
    } 
  }),
  claim: (riderId) => request('/rider/claim', { 
    method: 'POST', 
    riderId 
  }),
  sendPings: (riderId, pings) => request('/rider/locations', { 
    method: 'POST', 
    riderId, 
    body: { 
      pings 
    } 
  }),
  heartbeat: (riderId) => request('/rider/heartbeat', { 
    method: 'POST', 
    riderId 
  }),
  transition: (riderId, orderId, to, claimId) => request(`/orders/${orderId}/transitions`, { 
    method: 'POST', 
    riderId, 
    body: { 
      to, 
      claimId 
    } 
  }),
};
