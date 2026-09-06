import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { setOnline, signOut } from '../store/sessionSlice';
import { dismissConflicts, enqueueAdvance, enqueueClaim, resetApp } from '../store/outboxSlice';
import { useLocationPings } from '../hooks/useLocationPings';
import OrderCard from '../components/OrderCard';
import SyncBar from '../components/SyncBar';
import { colors, radius } from '../theme';

export default function ShiftScreen() {
  const dispatch = useDispatch();
  const { rider, currentOrder, shiftPending, error } = useSelector((s) => s.session);
  const { pending, rows, conflicts, draining } = useSelector((s) => s.outbox);

  useLocationPings(currentOrder);

  if (!rider) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const confirmReset = () =>
    Alert.alert(
      'Reset app data?',
      pending > 0
        ? `${pending} action${pending === 1 ? '' : 's'} have not reached the server yet. Resetting discards them and logs you out.`
        : 'This clears the local queue and logs you out.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => dispatch(resetApp()) },
      ],
    );

  const online = rider.is_online;
  const claimQueued = rows.some((r) => r.kind === 'CLAIM');
  const pendingFor = (orderId) => rows.some((r) => r.order_id === orderId);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{rider.name}</Text>
          <Text style={styles.muted}>{rider.phone}</Text>
        </View>
        <Pressable onPress={() => dispatch(signOut())}>
          <Text style={styles.link}>Log out</Text>
        </Pressable>
      </View>

      <SyncBar
        pending={pending}
        draining={draining}
        conflicts={conflicts}
        onDismiss={() => dispatch(dismissConflicts())}
      />

      <View style={[styles.card, online ? styles.onCard : styles.offCard]}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.shiftLabel}>{online ? 'On shift' : 'Off shift'}</Text>
            <Text style={styles.muted}>
              {shiftPending ? 'Asking the server…' : online ? 'You can claim orders' : 'Go online to claim orders'}
            </Text>
          </View>
          <View style={styles.switchSlot}>
            {shiftPending && <ActivityIndicator style={styles.spinner} color={colors.accent} />}
            <Switch
              value={online}
              disabled={shiftPending}
              onValueChange={(next) => dispatch(setOnline(next))}
              trackColor={{ false: colors.border, true: colors.successSoft }}
              thumbColor={online ? colors.success : '#fff'}
            />
          </View>
        </View>
      </View>

      {error && (
        <View style={[styles.card, styles.bad]}>
          <Text style={styles.badText}>{error}</Text>
        </View>
      )}

      {currentOrder ? (
        <OrderCard
          order={currentOrder}
          pending={pendingFor(currentOrder.id)}
          onAdvance={(to) => dispatch(enqueueAdvance(to))}
        />
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Current order</Text>
          <Text style={styles.muted}>
            {claimQueued ? 'Claim queued — will send when there is a connection.' : 'Nothing assigned to you.'}
          </Text>
        </View>
      )}

      {!currentOrder && (
        <Pressable
          style={({ pressed }) => [
            styles.claim,
            (!online || claimQueued) && styles.claimDisabled,
            pressed && !(!online || claimQueued) && styles.claimPressed,
          ]}
          disabled={!online || claimQueued}
          onPress={() => dispatch(enqueueClaim())}
        >
          <Text style={styles.claimText}>{claimQueued ? 'Claiming…' : 'Claim next order'}</Text>
        </Pressable>
      )}

      <Pressable style={styles.reset} onPress={confirmReset}>
        <Text style={styles.resetText}>Reset app data</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 64,
    gap: 12,
    backgroundColor: colors.bg,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    marginRight: 2,
  },
  grow: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 4,
  },
  onCard: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successSoft,
  },
  offCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.surfaceAlt,
  },
  bad: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerSoft,
  },
  badText: {
    color: colors.danger,
    fontWeight: '700',
  },
  shiftLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    fontSize: 12,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  muted: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  link: {
    color: colors.accent,
    fontWeight: '700',
  },
  claim: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: 18,
    alignItems: 'center',
  },
  claimPressed: {
    backgroundColor: '#ab5f32',
  },
  claimDisabled: {
    backgroundColor: colors.border,
  },
  claimText: {
    color: colors.accentInk,
    fontWeight: '800',
    fontSize: 16,
  },
  reset: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  resetText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
