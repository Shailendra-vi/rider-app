import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import * as Location from 'expo-location';
import { sendHeartbeat, sendLocationPings } from '../store/sessionSlice';

const TICK_MS = 15_000;
const MAX_BUFFERED_PINGS = 8;
const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED', 'FAILED']);

export function useLocationPings(order) {
  const dispatch = useDispatch();
  const buffer = useRef([]);
  const permissionGranted = useRef(false);

  useEffect(() => {
    if (!order || TERMINAL_STATUSES.has(order.status)) return undefined;

    const tracking = order.status === 'OUT_FOR_DELIVERY';

    const tickHeartbeat = async () => {
      try {
        await dispatch(sendHeartbeat()).unwrap();
      } catch {}
    };

    const tickLocation = async () => {
      try {
        if (!permissionGranted.current) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          permissionGranted.current = status === 'granted';
        }
        if (!permissionGranted.current) return;

        const position = await Location.getCurrentPositionAsync({ 
          accuracy: Location.Accuracy.Balanced 
        });
        buffer.current.push({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          recordedAt: new Date(position.timestamp).toISOString(),
          orderId: order.id,
        });
        
        if (buffer.current.length > MAX_BUFFERED_PINGS) {
          buffer.current = buffer.current.slice(-MAX_BUFFERED_PINGS);
        }

        await dispatch(sendLocationPings([...buffer.current])).unwrap();
        buffer.current = [];
      } catch {}
    };

    const tick = tracking ? tickLocation : tickHeartbeat;
    if (!tracking) buffer.current = [];

    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [dispatch, order?.id, order?.status]);
}
