import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import AuthSceneHost from './scene/AuthSceneHost';

export default function AuthLayout({ children, mode }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [paused, setPaused] = useState(false);
  const [sceneVisible, setSceneVisible] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', state => setActive(state === 'active'));
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => { mounted = false; motion.remove(); app.remove(); show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    fade.setValue(reduced ? 1 : 0);
    const animation = Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [mode, reduced, fade]);
  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" scrollEventThrottle={100} onScroll={event => setSceneVisible(event.nativeEvent.contentOffset.y < (wide ? 760 : 250))} contentContainerStyle={[s.scroll, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[s.shell, wide && s.wide]}>
        <View style={[s.story, wide ? s.storyWide : s.storyMobile]}>
          <View style={s.brandRow}>
            <View style={s.brand}><View style={s.brandIcon}><Svg width={25} height={25} viewBox="0 0 24 24"><Path d="M5 17 10 6h4l-3 6h6l-4 6" stroke="#fff8e9" strokeWidth={2.7} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg></View><Text style={s.brandText}>riderapp<Text style={s.brandDot}>.</Text></Text></View>
            <Text style={s.partner}>RIDER PARTNER</Text>
          </View>
          {wide && <View style={s.storyCopy}>
            <View style={s.eyebrowRow}><View style={s.dot} /><Text style={s.eyebrow}>A LITTLE CARE. EVERY DELIVERY.</Text></View>
            <Text style={s.heroTitle}>Good food.{ '\n' }Great <Text style={s.italic}>journeys.</Text></Text>
            <Text style={s.heroBody}>Bring a little happiness to someone's doorstep.{ '\n' }Your next chapter starts here.</Text>
          </View>}
          <View style={[s.scene, wide ? s.sceneWide : { height: keyboard ? 0 : 200, overflow: 'hidden' }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <AuthSceneHost mode={mode} motionEnabled={active && sceneVisible && !keyboard && !reduced && !paused} />
          </View>
          {wide && <View style={s.storyFooter}><View><Text style={s.footerHeading}>Made for the everyday hero.</Text><Text style={s.footerSub}>One neighbourhood. A thousand connections.</Text></View><Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Play scene animation' : 'Pause scene animation'} onPress={() => setPaused(!paused)} style={s.motionButton}><Text style={s.motionText}>{paused ? '▶' : 'Ⅱ'}</Text></Pressable></View>}
        </View>
        <View style={[s.formSide, wide && s.formWide]}>
          <Animated.View testID="auth-form" style={[s.form, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>
          <View style={s.trust}><Text style={s.trustText}>YOUR JOURNEY, SAFELY CONNECTED</Text><View style={s.trustLine} /></View>
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f5f2' }, scroll: { flexGrow: 1 }, shell: { flex: 1 }, wide: { flexDirection: 'row', minHeight: 760 },
  story: { backgroundColor: '#efe9dc' }, storyWide: { width: '53%', padding: 44, minHeight: 760 }, storyMobile: { paddingHorizontal: 24, paddingTop: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandIcon: { backgroundColor: '#9b4f28', width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, brandText: { fontSize: 24, fontWeight: '800', letterSpacing: -1, color: '#2b2620' }, brandDot: { color: '#9b4f28' }, partner: { fontSize: 9, color: '#655d53', letterSpacing: 1.8, fontWeight: '700' },
  storyCopy: { marginTop: 66 }, eyebrowRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#75816a' }, eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6, color: '#655d53' },
  heroTitle: { marginTop: 22, fontSize: 60, lineHeight: 66, fontWeight: '700', letterSpacing: -3.2, color: '#2b2620' }, italic: { color: '#9b4f28', fontStyle: 'italic', fontWeight: '500' }, heroBody: { marginTop: 20, fontSize: 15, lineHeight: 25, color: '#655d53' },
  scene: { width: '100%' }, sceneWide: { height: 330, marginTop: 12, flexGrow: 1 }, storyFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#dcd4c6', paddingTop: 22 }, footerHeading: { fontSize: 13, fontWeight: '600', color: '#403a30' }, footerSub: { fontSize: 11, color: '#655d53', marginTop: 6 }, motionButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#d4c9b8', justifyContent: 'center', alignItems: 'center' }, motionText: { color: '#655d53', fontWeight: '700' },
  formSide: { backgroundColor: '#fffefa', padding: 28, paddingTop: 30, flexGrow: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -16 }, formWide: { width: '47%', padding: 56, marginTop: 0, borderRadius: 0, justifyContent: 'center', minHeight: 760 }, form: { width: '100%', maxWidth: 420, alignSelf: 'center' }, trust: { width: '100%', maxWidth: 420, alignSelf: 'center', marginTop: 40, flexDirection: 'row', alignItems: 'center', gap: 14 }, trustText: { fontSize: 8, letterSpacing: 1.5, color: '#655d53' }, trustLine: { height: 1, flex: 1, backgroundColor: '#e8e1d6' },
});
