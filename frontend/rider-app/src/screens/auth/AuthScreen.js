import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import AuthLayout from '../../auth/AuthLayout';
import { Button, Field, Link, MethodSelector } from '../../auth/components/Controls';
import { maskContact, normalizeContact, validatePassword } from '../../auth/validation';
import { authApi } from '../../api/client';
import { acceptSession, clearError, refreshMe, signOut } from '../../store/sessionSlice';
import { getSession } from '../../auth/sessionRuntime';

const headings = {
  login: [
    'YOUR NEXT CHAPTER',
    'Welcome back.',
    'A fresh day. A new route. Let’s get you going.',
  ],
  signup: [
    'BECOME A RIDER PARTNER',
    'Your journey starts here.',
    'A few details, and you’re one step closer.',
  ],
  otp: [
    'ONE SMALL STEP',
    'Check your messages.',
    'Enter the six-digit code to continue.',
  ],
  forgot: [
    'LET’S GET YOU BACK',
    'Forgot your password?',
    'We’ll help you reset it with an email code.',
  ],
  reset: [
    'A FRESH START',
    'Set a new password.',
    'Choose something long, unique, and just for you.',
  ],
};

export default function AuthScreen() {
  const dispatch = useDispatch();
  const sessionError = useSelector((state) => state.session.error);

  const [mode, setMode] = useState('login');
  const [channel, setChannel] = useState('phone');
  const [contacts, setContacts] = useState({ phone: '+91 ', email: '' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [emailOtp, setEmailOtp] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const operation = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      operation.current += 1;
    };
  }, []);

  const cooldown = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const blocked = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  const expired = challenge && now >= new Date(challenge.expiresAt).getTime();

  const navigate = (next) => {
    operation.current += 1;
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmation('');
    setCode('');
    setBusy(false);
    dispatch(clearError());
  };
  
  const run = async (task) => {
    if (busy) return;

    const current = ++operation.current;
    setBusy(true);
    setError('');
    setNotice('');
    dispatch(clearError());

    const valid = () => current === operation.current;

    try {
      await task(valid);
    } catch (err) {
      if (!valid()) return;
      setError(err.message || 'Something went wrong. Please try again.');

      if (err.details?.retryAfterSeconds)
        setBlockedUntil(Date.now() + err.details.retryAfterSeconds * 1000);
    } finally {
      if (valid()) setBusy(false);
    }
  };

  const finish = async (result, valid) => {
    if (!valid()) return;
    await dispatch(acceptSession(result)).unwrap();
    dispatch(refreshMe());
  };

  const start = () =>
    run(async (valid) => {
      const actualChannel = mode === 'forgot' ? 'email' : channel;
      const contact = normalizeContact(actualChannel, contacts[actualChannel]);

      if (mode === 'login' && channel === 'email' && !emailOtp) {
        if (!password) 
          throw new Error('Enter your password.');
        return finish(
          await authApi.post('signin/password', { 
            email: contact, 
            password 
          }),
          valid,
        );
      }

      const purpose =
        mode === 'signup' 
          ? 'signup' : mode === 'forgot' 
          ? 'reset' : 'signin';

      const body = { 
        channel: actualChannel, 
        contact 
      };

      if (purpose === 'signup') {
        if (!name.trim() || name.trim().length > 100)
          throw new Error('Enter your full name (up to 100 characters).');

        body.name = name.trim();

        if (actualChannel === 'email') {
          validatePassword(password, confirmation);
          body.password = password;
        }
      }

      const endpoint = {
        signup: 'signup/start',
        signin: 'signin/otp/start',
        reset: 'password/reset/start',
      }[purpose];

      const result = await authApi.post(endpoint, body);
      if (!valid()) return;
      
      setChallenge({ ...result, channel: actualChannel, contact, purpose });
      setNow(Date.now());
      setRetryAt(Date.now() + result.resendAfterSeconds * 1000);
      setPassword('');
      setConfirmation('');
      setCode('');

      Keyboard.dismiss();
      setMode('otp');
    });

  const verify = () =>
    run(async (valid) => {
      if (!/^\d{6}$/.test(code)) throw new Error('Enter all six digits.');

      if (challenge.purpose === 'reset') {
        setMode('reset');
        return;
      }

      const endpoint =
        challenge.purpose === 'signup' ? 'signup/verify' : 'signin/otp/verify';
      await finish(
        await authApi.post(endpoint, { 
          challengeId: challenge.challengeId, 
          code 
        }),
        valid,
      );
    });

  const resend = () =>
    run(async (valid) => {
      const result = await authApi.post('otp/resend', {
        challengeId: challenge.challengeId,
      });
      if (!valid()) return;

      setChallenge((previous) => ({ ...previous, ...result }));
      setCode('');
      setNow(Date.now());
      setRetryAt(Date.now() + result.resendAfterSeconds * 1000);
      setNotice('If eligible, a new code will arrive shortly.');
    });

  const reset = () =>
    run(async (valid) => {
      validatePassword(password, confirmation);
      await authApi.post('password/reset/complete', {
        challengeId: challenge.challengeId,
        code,
        password,
      });

      if (!valid()) return;

      setPassword('');
      setConfirmation('');
      setCode('');
      setEmailOtp(false);
      setChannel('email');
      setMode('login');
      setRetryAt(0);
      setNotice('Password updated. Sign in with your new password.');
    });


  const [eyebrow, heading, subtitle] = headings[mode];
  const isOtp = mode === 'otp';
  const isPasswordLogin = mode === 'login' && channel === 'email' && !emailOtp;
  const passwordVisible =
    mode === 'reset' ||
    (channel === 'email' && (mode === 'signup' || (mode === 'login' && !emailOtp)));

  
  return (
    <AuthLayout mode={mode}>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text
        accessibilityRole="header"
        style={s.title}
      >
        {isOtp && challenge.channel === 'email' ? 'Check your email.' : heading}
      </Text>
      <Text style={s.subtitle}>{subtitle}</Text>
      {['login', 'signup'].includes(mode) && (
        <MethodSelector
          channel={channel}
          disabled={busy}
          onChange={(next) => {
            setChannel(next);
            setError('');
            setPassword('');
            setConfirmation('');
          }}
        />
      )}
      {mode === 'signup' && (
        <Field
          label="Full name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          placeholder="How should we call you?"
          editable={!busy}
          maxLength={100}
        />
      )}
      {['login', 'signup', 'forgot'].includes(mode) && (
        <View style={mode === 'forgot' && { marginTop: 28 }}>
          <Field
            label={
              mode === 'forgot' || channel === 'email' ? 'Email address' : 'Phone number'
            }
            value={contacts[mode === 'forgot' ? 'email' : channel]}
            onChangeText={(value) =>
              setContacts((previous) => ({
                ...previous,
                [mode === 'forgot' ? 'email' : channel]: value,
              }))
            }
            placeholder={
              mode === 'forgot' || channel === 'email'
                ? 'you@example.com'
                : '+91 98765 43210'
            }
            keyboardType={
              mode === 'forgot' || channel === 'email' ? 'email-address' : 'phone-pad'
            }
            autoComplete={mode === 'forgot' || channel === 'email' ? 'email' : 'tel'}
            editable={!busy}
            maxLength={254}
          />
          {mode !== 'forgot' && channel === 'phone' && (
            <Text style={s.hint}>
              Include your country code. We’ll send a verification code.
            </Text>
          )}
        </View>
      )}
      {passwordVisible && (
        <View style={mode === 'reset' && { marginTop: 28 }}>
          <Field
            label={mode === 'reset' ? 'New password' : 'Password'}
            password
            value={password}
            onChangeText={setPassword}
            placeholder={
              mode === 'login' ? 'Enter your password' : 'At least 12 characters'
            }
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            editable={!busy}
            maxLength={128}
          />
          {mode !== 'login' && (
            <Field
              label="Confirm password"
              password
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder="Enter it once more"
              autoComplete="new-password"
              editable={!busy}
              maxLength={128}
            />
          )}
        </View>
      )}
      {mode === 'login' && channel === 'email' && (
        <View style={s.linkRow}>
          <Link
            disabled={busy}
            onPress={() => {
              setEmailOtp(!emailOtp);
              setPassword('');
              setError('');
            }}
          >
            {emailOtp ? 'Use password instead' : 'Use a code instead'}
          </Link>
          <Link
            disabled={busy}
            onPress={() => navigate('forgot')}
          >
            Forgot password?
          </Link>
        </View>
      )}
      {isOtp && (
        <View style={s.otpArea}>
          <View style={s.destination}>
            <Text style={s.destinationText}>
              {maskContact(challenge.channel, challenge.contact)}
            </Text>
            <Text style={s.dot}>●</Text>
          </View>
          <View style={s.otpWrap}>
            <View
              style={s.otpCells}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <View
                  key={index}
                  style={[s.otpCell, index === code.length && s.otpActive]}
                >
                  <Text style={s.otpDigit}>{code[index] || '·'}</Text>
                </View>
              ))}
            </View>
            <TextInput
              accessibilityLabel="Six-digit verification code"
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              caretHidden
              style={s.otpInput}
              editable={!busy}
            />
          </View>
          <Text style={s.hint}>
            {expired
              ? 'This code has expired. Request a new one below.'
              : 'If eligible, a code will arrive shortly. Check spam for email codes.'}
          </Text>
        </View>
      )}
      {(error || sessionError) && (
        <View
          style={s.error}
          accessibilityLiveRegion="polite"
        >
          <Text style={s.errorText}>{error || sessionError}</Text>
        </View>
      )}
      {!!notice && (
        <View
          style={s.notice}
          accessibilityLiveRegion="polite"
        >
          <Text style={s.noticeText}>{notice}</Text>
        </View>
      )}
      {!isOtp && !isPasswordLogin && mode !== 'reset' && cooldown > 0 && (
        <Text style={s.hint}>Please wait {cooldown}s before trying again.</Text>
      )}
      {blocked > 0 && (
        <Text style={s.hint}>Too many attempts. Try again in {blocked}s.</Text>
      )}
      <Button
        loading={busy}
        disabled={
          blocked > 0 ||
          (isOtp
            ? code.length !== 6 || expired
            : mode === 'reset' || isPasswordLogin
              ? false
              : cooldown > 0)
        }
        onPress={isOtp ? verify : mode === 'reset' ? reset : start}
      >
        {isOtp
          ? challenge.purpose === 'reset'
            ? 'Continue'
            : 'Verify and continue'
          : mode === 'signup'
            ? 'Create my account'
            : mode === 'forgot'
              ? 'Send reset code'
              : mode === 'reset'
                ? 'Update password'
                : channel === 'email' && !emailOtp
                  ? 'Sign in'
                  : 'Send login code'}
      </Button>
      {isOtp ? (
        <>
          <View style={s.bottomRow}>
            <Text style={s.small}>Didn’t receive a code?</Text>
            <Link
              disabled={busy || cooldown > 0 || blocked > 0}
              onPress={resend}
            >
              {cooldown ? `Resend in ${cooldown}s` : 'Resend code'}
            </Link>
          </View>
          <Link
            disabled={busy}
            onPress={() =>
              navigate(
                challenge.purpose === 'signup'
                  ? 'signup'
                  : challenge.purpose === 'reset'
                    ? 'forgot'
                    : 'login',
              )
            }
          >
            ← Change {challenge.channel === 'email' ? 'email address' : 'phone number'}
          </Link>
        </>
      ) : mode === 'login' || mode === 'signup' ? (
        <>
          <View style={s.divider}>
            <View style={s.line} />
            <Text style={s.dividerText}>GOOD THINGS AHEAD</Text>
            <View style={s.line} />
          </View>
          <View style={s.bottomRow}>
            <Text style={s.small}>
              {mode === 'login'
                ? 'New to the rider community?'
                : 'Already part of the journey?'}
            </Text>
            <Link
              disabled={busy}
              onPress={() => navigate(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login' ? 'Join us' : 'Sign in'}
            </Link>
          </View>
          <Text style={s.finePrint}>
            {mode === 'signup'
              ? 'Contact verification is the first step. Identity verification is required before you can start deliveries.'
              : 'A little effort. A meaningful difference. Every day.'}
          </Text>
        </>
      ) : (
        <Link
          disabled={busy}
          onPress={() => navigate(mode === 'reset' ? 'forgot' : 'login')}
        >
          ← {mode === 'reset' ? 'Request a new reset code' : 'Back to sign in'}
        </Link>
      )}
      {mode === 'login' && getSession() && (
        <Button
          secondary
          loading={busy}
          onPress={() =>
            run(async () => {
              await dispatch(refreshMe()).unwrap();
            })
          }
        >
          Retry saved session
        </Button>
      )}
    </AuthLayout>
  );
}

export function PendingAccountScreen() {
  const dispatch = useDispatch();
  const { rider, error } = useSelector((state) => state.session);
  const [busy, setBusy] = useState(false);


  const refresh = async () => {
    setBusy(true);
    await dispatch(refreshMe());
    setBusy(false);
  };


  return (
    <AuthLayout mode="pending">
      <View style={s.successIcon}>
        <Text style={s.successCheck}>✓</Text>
      </View>
      <Text style={s.eyebrow}>YOU’RE PART OF THE JOURNEY</Text>
      <Text
        accessibilityRole="header"
        style={s.title}
      >
        Welcome, {rider.name.split(' ')[0]}.
      </Text>
      <Text style={s.subtitle}>
        Your account is ready. There’s one more step before your first delivery.
      </Text>
      <View style={s.checklist}>
        <View style={s.checkRow}>
          <Text style={s.check}>✓</Text>
          <View>
            <Text style={s.checkTitle}>Contact verified</Text>
            <Text style={s.checkBody}>{rider.email || rider.phone}</Text>
          </View>
        </View>
        <View style={s.checkRow}>
          <Text style={s.pendingDot}>○</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.checkTitle}>Identity verification & activation</Text>
            <Text style={s.checkBody}>
              Deliveries will be available once verification and account activation are
              complete.
            </Text>
          </View>
        </View>
      </View>
      {error && <Text style={s.errorText}>{error}</Text>}
      <Button
        onPress={refresh}
        loading={busy}
      >
        Check account status
      </Button>
      <Link onPress={() => dispatch(signOut())}>Sign out</Link>
    </AuthLayout>
  );
}

const s = StyleSheet.create({
  eyebrow: {
    color: '#9b4f28',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    marginBottom: 14,
  },
  title: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
    letterSpacing: -1.3,
    color: '#2b2620',
  },
  subtitle: { fontSize: 14, lineHeight: 23, color: '#655d53', marginTop: 12 },
  hint: {
    color: '#655d53',
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 18,
    marginTop: -5,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -15,
    marginBottom: 8,
    gap: 12,
    flexWrap: 'wrap',
  },
  error: { backgroundColor: '#fae4dd', padding: 13, borderRadius: 12, marginBottom: 14 },
  errorText: { fontSize: 13, color: '#9b3624', lineHeight: 20 },
  notice: { backgroundColor: '#e8eee3', padding: 13, borderRadius: 12, marginBottom: 14 },
  noticeText: { fontSize: 13, color: '#3e6245', lineHeight: 20 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 32,
    marginBottom: 8,
  },
  line: { flex: 1, height: 1, backgroundColor: '#e8e1d6' },
  dividerText: { fontSize: 8, color: '#655d53', letterSpacing: 1.4 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  small: { fontSize: 12, color: '#655d53' },
  finePrint: {
    textAlign: 'center',
    color: '#655d53',
    fontSize: 11,
    lineHeight: 19,
    marginTop: 10,
  },
  otpArea: { marginTop: 25 },
  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f1ede6',
    borderRadius: 10,
    marginBottom: 25,
  },
  destinationText: { fontSize: 14, color: '#403a30', fontWeight: '500' },
  dot: { color: '#75816a', fontSize: 8 },
  otpWrap: { height: 62, marginBottom: 23 },
  otpCells: { flexDirection: 'row', gap: 8, height: '100%' },
  otpCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e3ded4',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  otpActive: { borderColor: '#9b4f28', backgroundColor: '#fcf5ee' },
  otpDigit: { fontSize: 26, color: '#403a30', fontWeight: '600' },
  otpInput: {
    ...StyleSheet.absoluteFillObject,
    color: 'transparent',
    backgroundColor: 'transparent',
    opacity: 0.02,
    fontSize: 20,
  },
  successIcon: {
    width: 60,
    height: 60,
    backgroundColor: '#e8eee3',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  successCheck: { fontSize: 30, color: '#3e6245' },
  checklist: { gap: 26, marginVertical: 32 },
  checkRow: { flexDirection: 'row', gap: 15, alignItems: 'flex-start' },
  check: { fontSize: 21, color: '#3e6245' },
  pendingDot: { fontSize: 24, color: '#9b4f28' },
  checkTitle: { fontSize: 14, fontWeight: '600', color: '#403a30' },
  checkBody: { fontSize: 13, lineHeight: 21, color: '#655d53', marginTop: 5 },
});
