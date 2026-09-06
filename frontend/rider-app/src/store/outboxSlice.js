import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getOutbox } from '../outbox';
import { refreshMe } from './sessionSlice';

export const refreshOutbox = createAsyncThunk('outbox/refresh', async () => {
  const outbox = getOutbox();
  if (!outbox) return { pending: 0, rows: [], conflicts: [] };
  const [rows, conflicts, pending] = await Promise.all([
    outbox.unsettled(),
    outbox.conflicts(),
    outbox.pendingCount(),
  ]);
  return { pending, rows, conflicts };
});

export const drainOutbox = createAsyncThunk('outbox/drain', async (_, { dispatch, getState }) => {
  const outbox = getOutbox();
  if (!outbox) return;
  await outbox.drain();
  await dispatch(refreshOutbox());
  if (getState().session.riderId) await dispatch(refreshMe());
});

export const enqueueClaim = createAsyncThunk('outbox/enqueueClaim', async (_, { dispatch }) => {
  await getOutbox().enqueue({ kind: 'CLAIM' });
  await dispatch(refreshOutbox());
  await dispatch(drainOutbox());
});

export const enqueueAdvance = createAsyncThunk('outbox/enqueueAdvance', async (to, { dispatch, getState }) => {
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
});

export const dismissConflicts = createAsyncThunk('outbox/dismissConflicts', async (_, { dispatch }) => {
  await getOutbox().clearSettled();
  await dispatch(refreshOutbox());
});

const outboxSlice = createSlice({
  name: 'outbox',
  initialState: { ready: false, pending: 0, rows: [], conflicts: [], draining: false },
  reducers: {
    setReady(state, action) {
      state.ready = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(refreshOutbox.fulfilled, (state, action) => {
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

export const { setReady } = outboxSlice.actions;
export default outboxSlice.reducer;
