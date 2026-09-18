import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getOutbox } from '../outbox';
import { refreshMe, signOut } from './sessionSlice';
import { getSession } from '../auth/sessionRuntime';

export const refreshOutbox = createAsyncThunk('outbox/refresh', async () => {
  const ownerId = getSession()?.riderId;
  const outbox = getOutbox();
  if (!outbox) return { ownerId, pending: 0, rows: [], conflicts: [] };
  const [rows, conflicts, pending] = await Promise.all([
    outbox.unsettled(),
    outbox.conflicts(),
    outbox.pendingCount(),
  ]);
  return { ownerId, pending, rows, conflicts };
});

export const drainOutbox = createAsyncThunk(
  'outbox/drain',
  async (_, { dispatch, getState }) => {
    const ownerId = getSession()?.riderId;
    const outbox = getOutbox();
    if (!outbox) return;
    await outbox.drain();
    if (ownerId !== getSession()?.riderId) return;
    await dispatch(refreshOutbox());
    if (getState().session.riderId) await dispatch(refreshMe());
  },
);

export const enqueueClaim = createAsyncThunk(
  'outbox/enqueueClaim',
  async (_, { dispatch }) => {
    await getOutbox().enqueue({ kind: 'CLAIM' });
    await dispatch(refreshOutbox());
    await dispatch(drainOutbox());
  },
);

export const enqueueAdvance = createAsyncThunk(
  'outbox/enqueueAdvance',
  async (to, { dispatch, getState }) => {
    const { currentOrder } = getState().session;
    await getOutbox().enqueue({
      kind: 'TRANSITION',
      orderId: currentOrder.id,
      targetStatus: to,
      claimId: currentOrder.claim_id,
      body: { to, claimId: currentOrder.claim_id },
    });
    await dispatch(refreshOutbox());
    await dispatch(drainOutbox());
  },
);

export const dismissConflicts = createAsyncThunk(
  'outbox/dismissConflicts',
  async (_, { dispatch }) => {
    await getOutbox().clearSettled();
    await dispatch(refreshOutbox());
  },
);

export const resetApp = createAsyncThunk('outbox/resetApp', async (_, { dispatch }) => {
  await getOutbox()?.reset();
  await dispatch(refreshOutbox());
  await dispatch(signOut());
});

const outboxSlice = createSlice({
  name: 'outbox',
  initialState: {
    ownerId: null,
    ready: false,
    initError: null,
    pending: 0,
    rows: [],
    conflicts: [],
    draining: false,
  },
  reducers: {
    setOwner(state, action) {
      state.ownerId = action.payload;
      state.ready = false;
      state.initError = null;
      state.pending = 0;
      state.rows = [];
      state.conflicts = [];
      state.draining = false;
    },
    setReady(state, action) {
      state.ready = action.payload;
    },
    setInitError(state, action) {
      state.initError = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(refreshOutbox.fulfilled, (state, action) => {
        if (state.ownerId !== action.payload.ownerId) return;
        state.pending = action.payload.pending;
        state.rows = action.payload.rows;
        state.conflicts = action.payload.conflicts;
      })
      .addCase(drainOutbox.pending, (state) => {
        state.draining = true;
      })
      .addCase(drainOutbox.fulfilled, (state) => {
        state.draining = false;
      })
      .addCase(drainOutbox.rejected, (state) => {
        state.draining = false;
      });
  },
});

export const { setReady, setInitError, setOwner } = outboxSlice.actions;
export default outboxSlice.reducer;
