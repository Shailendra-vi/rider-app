import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export function Field({ label, password, ...props }) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);


  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.focused]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor="#91877a"
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          secureTextEntry={password && !visible}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
        
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            onPress={() => setVisible(!visible)}
            style={styles.show}
          >
            <Text style={styles.showText}>{visible ? 'Hide' : 'Show'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Button({ children, loading, disabled, onPress, secondary }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      accessibilityState={{
        disabled: Boolean(disabled || loading),
        busy: Boolean(loading),
      }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (disabled || loading) && { opacity: 0.55 },
        pressed && { opacity: 0.8, transform: [{ scale: 0.99 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? '#9b4f28' : '#fff'} />
      ) : (
        <>
          <Text style={[styles.buttonText, secondary && { color: '#9b4f28' }]}>
            {children}
          </Text>
          {!secondary && <Text style={styles.arrow}>↗</Text>}
        </>
      )}
    </Pressable>
  );
}

export function Link({ children, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        justifyContent: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
      })}
    >
      <Text style={styles.link}>{children}</Text>
    </Pressable>
  );
}

export function MethodSelector({ channel, onChange, disabled }) {
  return (
    <View style={styles.tabs}>
      {['phone', 'email'].map((method) => (
        <Pressable
          key={method}
          accessibilityRole="tab"
          accessibilityState={{ selected: channel === method, disabled }}
          disabled={disabled}
          onPress={() => onChange(method)}
          style={[styles.tab, channel === method && styles.tabActive]}
        >
          <Text style={[styles.tabText, channel === method && styles.tabTextActive]}>
            {method === 'phone' ? 'Phone number' : 'Email address'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  field: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: '#403a30', marginBottom: 9 },
  inputWrap: {
    borderWidth: 1,
    borderColor: '#e3ded4',
    borderRadius: 14,
    backgroundColor: '#fffefa',
    flexDirection: 'row',
    alignItems: 'center',
  },
  focused: { borderColor: '#9b4f28', backgroundColor: '#fff' },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#2b2620',
    minHeight: 54,
    outlineStyle: 'none',
  },
  show: { paddingHorizontal: 15, minHeight: 48, justifyContent: 'center' },
  showText: { color: '#655d53', fontSize: 12, fontWeight: '600' },
  button: {
    backgroundColor: '#9b4f28',
    minHeight: 56,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
  },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  arrow: { color: '#fff', fontSize: 21, position: 'absolute', right: 20 },
  secondary: { backgroundColor: '#f5eee4', borderWidth: 1, borderColor: '#e8d8c8' },
  link: { fontSize: 13, fontWeight: '600', color: '#9b4f28' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#f1ede6',
    borderRadius: 13,
    padding: 4,
    marginTop: 27,
    marginBottom: 26,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabActive: { backgroundColor: '#fffefa', boxShadow: '0px 2px 5px rgba(43,38,32,0.06)' },
  tabText: { color: '#655d53', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#2b2620', fontWeight: '700' },
});
