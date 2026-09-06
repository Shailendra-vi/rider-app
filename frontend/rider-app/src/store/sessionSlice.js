import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

const RIDER_KEY = 'riderapp.riderId';

export const hydrateSession = createAsyncThunk('session/hydrate', async () => {
  return AsyncStorage.getItem(RIDER_KEY);
});

export const fetchRiders = createAsyncThunk('session/fetchRiders', async (_, { rejectWithValue }) => {
  try {
    return await api.listRiders();
  } catch (err) {
    return rejectWithValue(err.timedOut ? 'Request timed out' : err.message);
  }
});

export const selectRider = createAsyncThunk('session/selectRider', async (riderId, { rejectWithValue }) => {
  try {
    const me = await api.getMe(riderId);
    await AsyncStorage.setItem(RIDER_KEY, riderId);
    return me;
  } catch (err) {
    return rejectWithValue(err.timedOut ? 'Request timed out' : err.message);
  }
});

export const refreshMe = createAsyncThunk('session/refreshMe', async (_, { getState, rejectWithValue }) => {
  const { riderId } = getState().session;
  try {
    return await api.getMe(riderId);
  } catch (err) {
    return rejectWithValue(err.timedOut ? 'Request timed out' : err.message);
  }
});

export const signOut = createAsyncThunk('session/signOut', async () => {
  await AsyncStorage.removeItem(RIDER_KEY);
});

export const setOnline = createAsyncThunk('session/setOnline', async (online, { getState, rejectWithValue }) => {
  const { riderId } = getState().session;
  try {
    return await api.setShift(riderId, online);
  } catch (err) {
    return rejectWithValue(err.timedOut ? 'Request timed out' : err.message);
  }
});

export const sendLocationPings = createAsyncThunk('session/sendLocationPings', async (pings, { getState }) => {
  const { riderId } = getState().session;
  return api.sendPings(riderId, pings);
});

export const sendHeartbeat = createAsyncThunk('session/sendHeartbeat', async (_, { getState }) => {
  const { riderId } = getState().session;
  return api.heartbeat(riderId);
});

const initialState = {
  hydrated: false,
  riderId: null,
  rider: null,
  currentOrder: null,
  riders: [],
  ridersStatus: 'idle',
  shiftPending: false,
  lastPingAt: null,
  lastPingFailed: false,
  error: null,
};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateSession.fulfilled, (state, action) => {
        state.hydrated = true;
        state.riderId = action.payload;
      })
      .addCase(hydrateSession.rejected, (state) => {
        state.hydrated = true;
      })

      .addCase(fetchRiders.pending, (state) => {
        state.ridersStatus = 'loading';
        state.error = null;
      })
      .addCase(fetchRiders.fulfilled, (state, action) => {
        state.ridersStatus = 'ok';
        state.riders = action.payload;
      })
      .addCase(fetchRiders.rejected, (state, action) => {
        state.ridersStatus = 'error';
        state.error = action.payload ?? 'Could not load riders';
      })

      .addCase(signOut.fulfilled, () => ({ ...initialState, hydrated: true }))

      .addCase(setOnline.pending, (state) => {
        state.shiftPending = true;
        state.error = null;
      })
      .addCase(setOnline.fulfilled, (state, action) => {
        state.shiftPending = false;
        state.rider = action.payload;
      })
      .addCase(setOnline.rejected, (state, action) => {
        state.shiftPending = false;
        state.error = action.payload ?? 'Could not change shift';
      })

      .addMatcher(
        (action) => [sendLocationPings.fulfilled.type, sendHeartbeat.fulfilled.type].includes(action.type),
        (state, action) => {
          state.lastPingAt = Date.now();
          state.lastPingFailed = false;
          if (state.currentOrder && action.payload?.leaseRenewedUntil) {
            state.currentOrder.claim_expires_at = action.payload.leaseRenewedUntil;
          }
        },
      )
      .addMatcher(
        (action) => [sendLocationPings.rejected.type, sendHeartbeat.rejected.type].includes(action.type),
        (state) => {
          state.lastPingFailed = true;
        },
      )

      .addMatcher(
        (action) => [selectRider.fulfilled.type, refreshMe.fulfilled.type].includes(action.type),
        (state, action) => {
          state.rider = action.payload.rider;
          state.riderId = action.payload.rider.id;
          state.currentOrder = action.payload.currentOrder;
          state.error = null;
        },
      )
      .addMatcher(
        (action) => [selectRider.rejected.type, refreshMe.rejected.type].includes(action.type),
        (state, action) => {
          state.error = action.payload ?? 'Could not load rider';
        },
      );
  },
});

export const { clearError } = sessionSlice.actions;
export default sessionSlice.reducer;
