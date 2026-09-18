# Rider authentication UI plan (2026-09-16)

User request: plan a smooth, modern 3D login/signup UI using Three.js and preserve
the same scene for future sessions. This file holds the design specification;
CLAUDE.md holds implementation state and links here. The initial implementation now
exists; see frontend/rider-app/AUTH_UI.md for behavior and verification limits.

### Scope and existing backend

- Build the rider authentication experience in `frontend/rider-app` first (Expo /
  React Native). Customer and kitchen are future, separate account types; do not
  offer working login for them yet. SSO and actual Aadhaar verification are deferred.
- Backend signup, email/password login, email/phone OTP, reset and bearer sessions
  exist. Use `backend/AUTH.md` and the current backend code for the API contract.
  The historical `X-Rider-Id` authentication notes below are superseded.
- Authentication success does not imply identity verification or permission to work.
  New pending riders see an account/onboarding screen, not an enabled shift screen.
- Do not change backend account `status` into shift availability: `is_online` is
  separate. No account-status rename has been requested.

### Visual direction: warm, sculpted delivery scene

Use a miniature delivery scooter with a stacked tiffin carrier on its rear rack,
resting above a rounded cream platform. A short curved route and one terracotta
destination pin establish the delivery theme. Rounded geometry, matte materials,
soft lighting, and generous empty space should make this feel calm and modern.
Do not replace the scene with unrelated floating spheres or redesign it per screen.

- Background: existing warm cream `#f7f5f2`; form surface `#ffffff`.
- Main text: existing charcoal `#2b2620`; scene accent: terracotta `#c2703d`.
- Use darker terracotta `#9b4f28` for primary buttons with white text, and dark muted
  text `#655d53` for labels. Check actual contrast during implementation.
- Scooter body: terracotta. Wheels/seat: charcoal. Carrier: warm white with muted
  sage `#6b806c` straps. Avoid reflective chrome, neon, and heavy glass effects.
- Cards: 24px corners; inputs/buttons: 14px corners; spacing: 8/16/24/32px.
- Typography: system font initially; 30–34px headings, 16px body/input text,
  14px secondary copy. Respect system font scaling.
- Forms have opaque backgrounds; never place editable text directly over the scene.

### Canonical scene and reuse contract

Scene identifier: `rider-auth-delivery-v1`.

Planned source structure inside `frontend/rider-app/src`:

| Planned file | Responsibility |
| --- | --- |
| `auth/AuthLayout.js` | Persistent scene host, safe areas, keyboard-aware form area |
| `auth/scene/AuthScene.js` | Shared Three.js meshes, materials, lights, animation |
| `auth/scene/sceneConfig.js` | Canonical geometry, palette, camera and motion values |
| `auth/scene/AuthSceneHost.native.js` | Native renderer lifecycle and fallback |
| `auth/scene/AuthSceneHost.web.js` | Web canvas lifecycle and fallback, if web is supported |
| `auth/scene/AuthSceneFallback.js` | Matching static illustration/composition |
| `auth/components/` | Shared fields, method selector, primary button, OTP input |
| `screens/auth/` | Login, signup, OTP, forgot/reset password, pending account screens |

These files are planned, not currently present. Keep one scene mounted in AuthLayout
while switching forms. Forms pass only `mode`, `motionEnabled`, and `quality` to the
scene; never pass passwords, contacts, OTPs, tokens, or backend verification data.
Reuse the same geometry/material definitions and scene configuration across hosts.
Do not copy meshes into individual screens or recreate the canvas on each keystroke.

Reproducible initial composition (tune once on device, then keep values centralized):

- Orthographic camera near `[6, 4, 7]`, looking at `[0, 0.7, 0]`; fit the entire
  composition with 15% padding rather than using a fixed zoom for every viewport.
- Scooter is approximately 2.4 scene units long, centered over a 3.6-unit platform;
  its front points right. Keep the destination pin behind/right of the scooter.
- Warm background, one hemisphere fill and one upper-left key light. Use a cheap
  soft shadow plane instead of dynamic shadow maps in the first version.
- Build the initial scooter/tiffin from reusable primitive geometry. No external
  models, remote textures, or paid assets are required for the first iteration.
- Any later model/fallback assets must be committed with this same composition,
  palette and camera; do not depend on an undocumented prompt to reproduce the scene.

### Screen layouts and flows

On phones: compact brand label, 3D hero occupying roughly the upper 25–30% of the
available screen (around 180–240px on typical portrait phones), then the form.
Small screens scroll. When the keyboard opens, collapse/freeze the hero so the focused
field, error and submit action remain reachable. Never resize the canvas every frame.
On wide screens (initial breakpoint 900px): scene on the left, form on the right with
a maximum form width of 420px. Preserve safe areas and comfortable landscape behavior.

| Screen | Contents and action |
| --- | --- |
| Login | “Welcome back”; Phone / Email selector; phone defaults to +91 with an editable country code; phone uses OTP; email uses password with “Use a code instead”; “Create account” link |
| Signup | “Start your rider journey”; full name and Phone / Email selector; phone requires no password; email requires password and confirmation; submit “Send verification code” |
| OTP | “Check your messages” or “Check your email”; masked destination; six-digit code; “Verify and continue”; resend countdown; “Change number/email” |
| Forgot password | Email field; “Send reset code”; reuse OTP presentation for the reset purpose |
| Reset password | New password and confirmation; “Update password”; success returns to login |
| Pending account | “Account created”; contact verified, identity verification pending; explain that deliveries are unavailable until activation; allow sign-out; no nonfunctional Aadhaar button |

Use one accessible text input styled as six OTP cells, supporting paste/autofill and
backspace. Preserve leading zeroes. Native text fields handle email/phone keyboards,
password visibility and password-manager hints. Touch targets are at least 48px.
Keep labels visible; placeholders are examples, not replacements for labels.

Use the returned challenge ID, expiry, and resend delay. Resend replaces the challenge
ID. Respect backend Retry-After for throttling. A 202 initiation response is generic:
do not claim delivery is confirmed. Show “If eligible, a code will arrive shortly”.
Provide invalid/expired code, offline, timeout, disabled submit, and rate-limit states.
Do not retry OTP sending automatically or issue requests during field typing.

### Motion and performance

- Idle motion: slow bounded yaw (about +/-4 degrees over 8 seconds), optional bob
  of at most 0.03 scene units. No continuous full rotation or camera orbit controls.
- Form transitions: 180–240ms fade and up to 12px translation. Scene mode changes
  interpolate subtly over 400–600ms without resetting the scene.
- Successful contact verification: one short pin pulse. No Aadhaar badge or
  visual implication of identity approval. Errors appear in the form without shaking it.
- Pause rendering in the background, when the scene is hidden, and while the keyboard
  occupies the screen. Reduced motion displays a static composition without looping.
- Initial budgets: <=30 draw calls, <=25k triangles, no postprocessing, no real-time
  shadows. Cap render scale around 1–1.5 and lower it when needed. These are targets
  to measure on real devices, not established performance claims.
- Aim for fluid motion on a representative midrange Android phone and iPhone; if
  rendering cannot remain stable, lower quality or use the matching static fallback.
- Form interaction never waits for 3D loading. Handle unsupported graphics, renderer
  errors and context loss with a fallback. Release GPU resources/listeners on teardown.

### Three.js integration and implementation sequence

Three.js is the requested scene engine. Evaluate React Three Fiber's native renderer
with Expo GL for the React Native host; use the web renderer for an optional web host.
Do not install arbitrary latest versions: first validate compatibility with the
existing Expo 57, React 19 and React Native 0.86 setup. Native renderer packaging is
evolving; confirm current supported imports/dependencies using official documentation.

1. Device spike: render one Three.js primitive on Android/iOS, verify release-build
   compatibility and context cleanup, then pin dependencies. Record whether Expo Go
   works or a development build is needed; do not assume either before testing.
2. Build AuthLayout, form controls and static fallback; validate keyboard, scrolling,
   large text and narrow screens before adding scene complexity.
3. Build `rider-auth-delivery-v1`, centralize sceneConfig and mount it persistently.
4. Wire login/signup/OTP/reset to the existing backend. Store tokens in secure native
   storage; restore sessions with `/rider/me`. An optional web host needs its own
   reviewed session-storage approach; never assume native secure storage works there.
5. Replace RiderPickerScreen. Before enabling authenticated delivery work, bind
   offline queued actions to their owning rider, isolate reads/sends by account,
   quarantine legacy ownerless rows, and pause on expired sessions. Never replay an
   old rider's queue with a new token.
6. Verify actual email/phone flows using development OTP delivery, expiry/resend,
   password reset, app restart, sign-out/account switching, screen reader access,
   reduced motion, graphics failure and background/resume. Profile on physical devices.

References for implementation (recheck supported versions when coding):
- https://r3f.docs.pmnd.rs/getting-started/introduction
- https://github.com/pmndrs/native
- https://threejs.org/docs/pages/WebGLRenderer.html

Completion means usable native forms, the same scene across authentication screens,
no animation-induced typing lag, and a functional fallback. This file records the
design target; current implementation state and remaining device checks live in CLAUDE.md.
