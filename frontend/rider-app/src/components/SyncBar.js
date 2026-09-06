import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

export default function SyncBar({ pending, draining, conflicts, onDismiss }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, pending > 0 ? styles.barPending : styles.barIdle]}>
        {draining && <ActivityIndicator size="small" color={colors.warning} />}
        <Text style={[styles.barText, { color: pending > 0 ? colors.warning : colors.inkMuted }]}>
          {pending > 0
            ? `${pending} action${pending === 1 ? '' : 's'} waiting to sync`
            : 'Everything synced'}
        </Text>
      </View>

      {conflicts.map((c) => (
        <View key={c.id} style={styles.conflict}>
          <Text style={styles.conflictTitle}>
            {c.target_status ? `${c.target_status.replace(/_/g, ' ')} could not be applied` : 'Action rejected'}
          </Text>
          <Text style={styles.conflictText}>{c.user_message ?? c.result_code}</Text>
        </View>
      ))}

      {conflicts.length > 0 && (
        <Pressable style={styles.dismiss} onPress={onDismiss}>
          <Text style={styles.dismissText}>Got it</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  barIdle: {
    backgroundColor: colors.surfaceAlt,
  },
  barPending: {
    backgroundColor: colors.warningSoft,
  },
  barText: {
    fontSize: 13,
    fontWeight: '700',
  },
  conflict: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: 14,
    gap: 4,
  },
  conflictTitle: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 13,
  },
  conflictText: {
    color: colors.danger,
    fontSize: 13,
  },
  dismiss: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  dismissText: {
    fontWeight: '700',
    fontSize: 12,
    color: colors.ink,
  },
});
