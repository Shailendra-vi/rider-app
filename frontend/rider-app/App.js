import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './src/store';
import { hydrateSession, refreshMe, selectRider } from './src/store/sessionSlice';
import { drainOutbox, refreshOutbox, setReady } from './src/store/outboxSlice';
import { initOutbox, subscribe } from './src/outbox';
import RiderPickerScreen from './src/screens/RiderPickerScreen';
import ShiftScreen from './src/screens/ShiftScreen';
import { colors } from './src/theme';

const DRAIN_INTERVAL_MS = 10_000;
const REFRESH_INTERVAL_MS = 10_000;

function Root() {
  const dispatch = useDispatch();
  const { hydrated, riderId, rider } = useSelector((s) => s.session);
  const outboxReady = useSelector((s) => s.outbox.ready);

  useEffect(() => {
    dispatch(hydrateSession());
  }, [dispatch]);

  useEffect(() => {
    let unsubscribe;
    initOutbox(() => store.getState().session.riderId).then(() => {
      dispatch(setReady(true));
      dispatch(refreshOutbox());
      unsubscribe = subscribe(() => dispatch(refreshOutbox()));
    });
    return () => unsubscribe?.();
  }, [dispatch]);

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

  if (!hydrated || !outboxReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
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
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
