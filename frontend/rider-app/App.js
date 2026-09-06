import { useCallback, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './src/store';
import { hydrateSession, refreshMe, selectRider } from './src/store/sessionSlice';
import { drainOutbox, refreshOutbox, setInitError, setReady } from './src/store/outboxSlice';
import { initOutbox, subscribe } from './src/outbox';
import RiderPickerScreen from './src/screens/RiderPickerScreen';
import ShiftScreen from './src/screens/ShiftScreen';
import { colors, radius } from './src/theme';

const DRAIN_INTERVAL_MS = 10_000;
const REFRESH_INTERVAL_MS = 10_000;

function Root() {
  const dispatch = useDispatch();
  const { hydrated, riderId, rider } = useSelector((s) => s.session);
  const { ready: outboxReady, initError } = useSelector((s) => s.outbox);
  const unsubscribeRef = useRef(null);

  const bootOutbox = useCallback(async () => {
    dispatch(setInitError(null));
    try {
      await initOutbox(() => store.getState().session.riderId);
      dispatch(setReady(true));
      dispatch(refreshOutbox());
      unsubscribeRef.current?.();
      unsubscribeRef.current = subscribe(() => dispatch(refreshOutbox()));
    } catch (err) {
      dispatch(setInitError(err?.message ?? 'Could not open on-device storage'));
    }
  }, [dispatch]);

  useEffect(() => {
    dispatch(hydrateSession());
  }, [dispatch]);

  useEffect(() => {
    bootOutbox();
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [bootOutbox]);

  useEffect(() => {
    if (hydrated && riderId && !rider) dispatch(selectRider(riderId));
  }, [dispatch, hydrated, riderId, rider]);

  useEffect(() => {
    if (!outboxReady || !riderId) return undefined;
    const timer = setInterval(() => dispatch(drainOutbox()), DRAIN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [dispatch, outboxReady, riderId]);

  useEffect(() => {
    if (!riderId) return undefined;
    const timer = setInterval(() => dispatch(refreshMe()), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [dispatch, riderId]);

  if (initError) {
    return (
      <View style={styles.centered}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Cannot start</Text>
          <Text style={styles.errorBody}>
            The on-device queue that keeps your actions safe offline could not be opened. Nothing is
            lost, but the app will not accept actions until this works.
          </Text>
          <Text style={styles.errorDetail}>{initError}</Text>
          <Pressable
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
            onPress={bootOutbox}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!hydrated || !outboxReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return riderId ? <ShiftScreen /> : <RiderPickerScreen />;
}

export default function App() {
  return (
    <Provider store={store}>
      <View style={styles.container}>
        <Root />
        <StatusBar style="auto" />
      </View>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 10,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.danger,
  },
  errorBody: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  errorDetail: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.inkMuted,
  },
  retry: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  retryPressed: {
    backgroundColor: '#ab5f32',
  },
  retryText: {
    color: colors.accentInk,
    fontWeight: '800',
  },
});
