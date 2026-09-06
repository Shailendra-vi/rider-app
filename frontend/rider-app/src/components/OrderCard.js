import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, statusColor } from '../theme';

const ACTION_LABELS = {
  OUT_FOR_DELIVERY: 'Picked up',
  DELIVERED: 'Delivered',
  FAILED: 'Nobody home',
  CANCELLED: 'Cancel',
};

function useCountdown(expiresAt) {
  const [left, setLeft] = useState(() => remaining(expiresAt));

  useEffect(() => {
    setLeft(remaining(expiresAt));

    const t = setInterval(() => setLeft(remaining(expiresAt)), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  return left;
}

function remaining(expiresAt) {
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function mmss(total) {
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function OrderCard({ order, pending, onAdvance }) {
  const secondsLeft = useCountdown(order.claim_expires_at);
  const expired = secondsLeft === 0;
  const status = statusColor(order.status);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <View style={[styles.dot, { backgroundColor: status.fg }]} />
          <Text style={[styles.statusText, { color: status.fg }]}>
            {order.status.replace(/_/g, ' ')}
          </Text>
        </View>
        <Text style={styles.price}>
          ₹{(Number(order.price_paise) / 100).toFixed(0)}
        </Text>
      </View>

      <Text style={styles.address}>
        {order.delivery_address}
      </Text>
      <Text style={styles.meta}>
        Service date {order.service_date}
      </Text>

      {order.status === 'PREPARING' && (
        <Text style={styles.waiting}>
          Waiting on the kitchen — tap "Picked up" once you have the food.
        </Text>
      )}

      {order.status === 'OUT_FOR_DELIVERY' && (
        <Text style={styles.tracking}>
          Sharing your live location while this delivery is in progress.
        </Text>
      )}

      {order.claim_expires_at && (
        <Text style={expired ? styles.leaseBad : styles.lease}>
          {expired
            ? 'Your claim may have expired — check before delivering'
            : `Yours. Released after ${mmss(secondsLeft)} only if this phone goes silent.`}
        </Text>
      )}

      <View style={styles.actions}>
        {pending && <ActivityIndicator color={colors.accent} />}

        {(order.allowedTransitions ?? [])
          .filter((t) => t !== 'CANCELLED')
          .map((to) => (
            <Pressable
              key={to}
              disabled={pending}
              style={({ pressed }) => [
                styles.action,
                pending && styles.actionDisabled,
                pressed && styles.actionPressed,
              ]}
              onPress={() => onAdvance(to)}
            >
              <Text style={styles.actionText}>
                {ACTION_LABELS[to] ?? to}
              </Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  address: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
    color: colors.ink,
  },
  meta: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  waiting: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  tracking: {
    color: colors.info,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  lease: {
    color: colors.inkMuted,
    fontSize: 12,
    marginTop: 4,
  },
  leaseBad: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  action: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  actionPressed: {
    backgroundColor: '#ab5f32',
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionText: {
    color: colors.accentInk,
    fontWeight: '700',
  },
});
