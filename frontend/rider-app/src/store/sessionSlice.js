import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api, authApi } from '../api/client';
import { getRevision, getSession, setSession } from '../auth/sessionRuntime';
import { sessionStorage } from '../auth/storage';

let storageQueue = Promise.resolve();
const persist = (value) => {
  storageQueue = storageQueue.catch(() => {}).then(() => sessionStorage.write(value));
  return storageQueue;
};

export const hydrateSession = createAsyncThunk(
  'session/hydrate',
  async (_, { rejectWithValue }) => {
    const revision = getRevision();
    try {
      const raw = await sessionStorage.read();
      if (revision !== getRevision()) return rejectWithValue({ stale: true });
      if (!raw) return null;

      const saved = JSON.parse(raw);
      if (
        !saved.token ||
        !saved.riderId ||
        new Date(saved.expiresAt).getTime() <= Date.now()
      ) {
        await persist(null);
        return null;
      }
      setSession(saved);
      try {
        return await api.getMe(saved.riderId);
      } catch (error) {
        return rejectWithValue({ message: error.message });
      }
    } catch {
      return rejectWithValue({
        message: 'Could not restore your session. Please sign in again.',
      });
    }
  },
);

export const acceptSession = createAsyncThunk(
  'session/accept',
  async (result, { rejectWithValue }) => {
    const saved = {
      token: result.token,
      riderId: result.rider.id,
      expiresAt: result.expiresAt,
    };

    setSession(saved);
    const revision = getRevision();
    try {
      await persist(JSON.stringify(saved));

      if (revision !== getRevision()) return rejectWithValue({ stale: true });

      return { rider: result.rider, currentOrder: null };
    } catch {
      if (revision === getRevision()) {
        setSession(null);
        await persist(null).catch(() => {});
      }
      return rejectWithValue({
        message: 'Could not securely save your session. Please try again.',
      });
    }
  },
);

export const signOut = createAsyncThunk('session/signOut', async () => {
  const logout = getSession() ? authApi.logout().catch(() => {}) : Promise.resolve();
  setSession(null);
  await persist(null);
  await logout;
});

export const expireSession = createAsyncThunk('session/expire', async () => {
  setSession(null);
  await persist(null);
});

function riderTask(name, fn) {
  return createAsyncThunk(name, async (arg, { rejectWithValue }) => {
    const session = getSession();
    const revision = getRevision();

    try {
      if (!session) return rejectWithValue({ stale: true });

      const data = await fn(session.riderId, arg);

      if (revision !== getRevision()) return rejectWithValue({ stale: true });

      return { data, riderId: session.riderId };
    } catch (error) {
      return rejectWithValue({
        stale: revision !== getRevision(),
        message: error.message,
      });
    }
  });
}

export const refreshMe = riderTask('session/refresh', (id) => api.getMe(id));
export const setOnline = riderTask('session/online', (id, online) =>
  api.setShift(id, online),
);
export const sendLocationPings = riderTask('session/locations', (id, pings) =>
  api.sendPings(id, pings),
);
export const sendHeartbeat = riderTask('session/heartbeat', (id) => api.heartbeat(id));

const initialState = {
  hydrated: false,
  riderId: null,
  rider: null,
  currentOrder: null,
  shiftPending: false,
  lastPingAt: null,
  lastPingFailed: false,
  error: null,
};

const slice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateSession.fulfilled, (state, { payload }) => {
        state.hydrated = true;
        if (payload) {
          state.rider = payload.rider;
          state.riderId = payload.rider.id;
          state.currentOrder = payload.currentOrder;
        }
      })
      .addCase(hydrateSession.rejected, (state, action) => {
        state.hydrated = true;
        if (!action.payload?.stale) state.error = action.payload?.message;
      })
      .addCase(acceptSession.fulfilled, (state, { payload }) => {
        state.hydrated = true;
        state.rider = payload.rider;
        state.riderId = payload.rider.id;
        state.currentOrder = null;
        state.error = null;
      })
      .addCase(signOut.pending, () => ({
        ...initialState,
        hydrated: true,
      }))
      .addCase(expireSession.pending, () => ({
        ...initialState,
        hydrated: true,
        error: 'Your session has ended. Please sign in again.',
      }))
      .addCase(setOnline.pending, (state) => {
        state.shiftPending = true;
        state.error = null;
      })
      .addCase(setOnline.fulfilled, (state, { payload }) => {
        if (state.riderId !== payload.riderId) return;
        state.shiftPending = false;
        state.rider = { ...state.rider, ...payload.data };
      })
      .addCase(refreshMe.fulfilled, (state, { payload }) => {
        if (state.riderId && state.riderId !== payload.riderId) return;

        state.riderId = payload.riderId;
        state.rider = payload.data.rider;
        state.currentOrder = payload.data.currentOrder;
        state.error = null;
      })
      .addMatcher(
        (action) =>
          [sendHeartbeat.fulfilled.type, sendLocationPings.fulfilled.type].includes(
            action.type,
          ),
        (state, { payload }) => {
          if (state.riderId !== payload.riderId) return;

          state.lastPingAt = Date.now();
          state.lastPingFailed = false;
          if (state.currentOrder && payload.data?.leaseRenewedUntil)
            state.currentOrder.claim_expires_at = payload.data.leaseRenewedUntil;
        },
      )
      .addMatcher(
        (action) =>
          [
            setOnline.rejected.type,
            refreshMe.rejected.type,
            sendHeartbeat.rejected.type,
            sendLocationPings.rejected.type,
          ].includes(action.type),
        (state, action) => {
          if (action.payload?.stale) return;
          state.shiftPending = false;
          state.error = action.payload?.message;
          state.lastPingFailed = true;
        },
      );
  },
});
export const { clearError } = slice.actions;
export default slice.reducer;
