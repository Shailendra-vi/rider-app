import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchRiders, selectRider } from '../store/sessionSlice';
import { colors, radius } from '../theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function RiderPickerScreen() {
  const dispatch = useDispatch();
  const { riders, ridersStatus, error } = useSelector((s) => s.session);

  useEffect(() => {
    dispatch(fetchRiders());
  }, [dispatch]);



  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Who are you?</Text>
      <Text style={styles.subtitle}>No login — pick a rider to start your shift.</Text>

      {ridersStatus === 'loading' && (
        <View style={styles.card}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Loading riders…</Text>
        </View>
      )}

      {ridersStatus === 'error' && (
        <View style={[styles.card, styles.bad]}>
          <Text style={styles.badText}>Cannot reach the backend</Text>
          <Text style={styles.muted}>{error}</Text>
          <Text style={styles.mono}>{API_URL}</Text>
          <Text style={styles.hint}>
            Backend running? Same Wi-Fi? Windows Firewall allowing port 3000? On iPhone, check
            Settings → Expo Go → Local Network.
          </Text>
        </View>
      )}

      {riders.map((rider) => (
        <Pressable
          key={rider.id}
          style={({ pressed }) => [styles.rider, pressed && styles.riderPressed]}
          onPress={() => dispatch(selectRider(rider.id))}
        >
          <View>
            <Text style={styles.riderName}>{rider.name}</Text>
            <Text style={styles.muted}>{rider.phone}</Text>
          </View>
          <View style={[styles.badge, rider.is_online ? styles.badgeOn : styles.badgeOff]}>
            <Text style={[styles.badgeText, { color: rider.is_online ? colors.success : colors.inkMuted }]}>
              {rider.is_online ? 'online' : 'offline'}
            </Text>
          </View>
        </Pressable>
      ))}


      {ridersStatus === 'ok' && riders.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.muted}>No riders on the backend yet. Seed some first.</Text>
        </View>
      )}


      <Pressable style={styles.button} onPress={() => dispatch(fetchRiders())}>
        <Text style={styles.buttonText}>Refresh</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 64,
    gap: 10,
    backgroundColor: colors.bg,
    flexGrow: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkMuted,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bad: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerSoft,
  },
  badText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.danger,
  },
  rider: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riderPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  riderName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  muted: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.inkMuted,
  },
  hint: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 6,
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeOn: {
    backgroundColor: colors.successSoft,
  },
  badgeOff: {
    backgroundColor: colors.surfaceAlt,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: {
    color: colors.accentInk,
    fontWeight: '700',
  },
});
