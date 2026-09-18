import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './src/store';
import {
  expireSession,
  hydrateSession,
  refreshMe,
  signOut,
} from './src/store/sessionSlice';
import { drainOutbox, refreshOutbox, setOwner, setReady } from './src/store/outboxSlice';
import { initOutbox, subscribe } from './src/outbox';
import { onSessionExpired } from './src/auth/sessionRuntime';
import AuthScreen, { PendingAccountScreen } from './src/screens/auth/AuthScreen';
import ShiftScreen from './src/screens/ShiftScreen';
import { Button, Link } from './src/auth/components/Controls';

function DeliveryRoot({ riderId }) {
  const dispatch = useDispatch();

  const [ready, readySet] = useState(false);
  const [error, errorSet] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe;
    let timer;

    dispatch(setOwner(riderId));
    readySet(false);
    errorSet(null);

    initOutbox(riderId)
      .then(() => {
        if (cancelled) return;
        readySet(true);
        dispatch(setReady(true));
        dispatch(refreshOutbox());
        unsubscribe = subscribe(() => dispatch(refreshOutbox()));
        timer = setInterval(() => dispatch(drainOutbox()), 10000);
      })
      .catch(() => {
        if (!cancelled)
          errorSet('Could not open your saved delivery actions. Please try again.');
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      clearInterval(timer);
      dispatch(setOwner(null));
    };
  }, [riderId, dispatch, retry]);

  if (error)
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 30, gap: 15 }}>
        <Text>{error}</Text>
        <Button onPress={() => setRetry(retry + 1)}>Try again</Button>
        <Link onPress={() => dispatch(signOut())}>Sign out</Link>
      </View>
    );

  if (!ready)
    return (
      <ActivityIndicator
        style={{ flex: 1 }}
        color="#9b4f28"
      />
    );

  return <ShiftScreen />;
}

function Root() {
  const dispatch = useDispatch();

  const { hydrated, rider, riderId } = useSelector((state) => state.session);

  useEffect(() => {
    const unsubscribe = onSessionExpired(() => dispatch(expireSession()));
    dispatch(hydrateSession());
    return unsubscribe;
  }, [dispatch]);

  useEffect(() => {
    if (!riderId) return;
    const timer = setInterval(() => dispatch(refreshMe()), 10000);
    return () => clearInterval(timer);
  }, [riderId, dispatch]);

  if (!hydrated)
    return (
      <ActivityIndicator
        style={{ flex: 1 }}
        color="#9b4f28"
      />
    );

  if (!rider) return <AuthScreen />;

  if (rider.status !== 'active' || rider.identity_verification_status !== 'verified')
    return <PendingAccountScreen />;

  return (
    <DeliveryRoot
      key={riderId}
      riderId={riderId}
    />
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#f7f5f2' }}>
          <Root />
          <StatusBar style="dark" />
        </View>
      </SafeAreaProvider>
    </Provider>
  );
}
