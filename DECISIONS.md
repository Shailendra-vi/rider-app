# DECISIONS.md

The choices I made, what else I considered, and why I picked what I picked.

---

## 1. Framework and database

**Node + Express + PostgreSQL, raw `pg`, no ORM.** React Native (Expo) for the app, Vite + React
for the dashboard.

I considered Prisma and TypeORM. The problem is that every correctness guarantee in this project
is a Postgres feature the ORM hides: `FOR UPDATE SKIP LOCKED`, partial unique indexes,
`ON CONFLICT ... WHERE`. I'd have dropped to raw SQL for the interesting parts anyway, so the ORM
would only be paying rent on the boring CRUD.

Money is `BIGINT` paise everywhere, never a decimal. `0.1 + 0.2 !== 0.3` is a real problem once you
start summing a ledger.

---

## 2. Time correctness, and the 11:00 cut-off

I keep two separate ideas and never mix them:

- A **service date** (`2025-08-12`) is a label for a day. Postgres `DATE`, and a plain
  `'YYYY-MM-DD'` string in JS.
- An **instant** (`recorded_at`, `expires_at`) is a moment. `TIMESTAMPTZ`, always UTC.

`src/lib/time.js` is the only file that knows IST exists. Everything else deals in date strings or
UTC instants.

The alternative was storing everything as `TIMESTAMPTZ` and using `AT TIME ZONE 'Asia/Kolkata'` in
queries. That spreads timezone logic across every query, and it forces the eligibility resolver to
need a database. One file is easier to get right and easier to change.

I also told the `pg` driver to return `DATE` columns as strings (`setTypeParser(1082)`). Without
that, `2025-08-12` comes back as a JS `Date` at UTC midnight, and formatting it in an IST process
can give you the 11th. That's a whole day of meals generated for the wrong date, and it's a very
easy bug to ship.

**Cut-off rule: 11:00 IST on D−1 for service date D.** A change counts for D only if
`recorded_at <= cutoff`. I put it the day before because the kitchen buys ingredients against a
headcount. A same-morning cut-off would let people cancel food that's already cooked.

**Pause at 10:59 vs 11:01 (for tomorrow):**

| | Result |
|---|---|
| 10:59 IST | Tomorrow's order is not created. Not billed. |
| 11:01 IST | Order is created, delivered, billed. The pause applies from the day after. |

**What if that day's orders were already generated?** Nothing changes, and that's deliberate.
Generation resolves eligibility **as of the cut-off instant**, not as of `now()`. A pause recorded
at 11:01 is invisible to that date's resolver whether generation ran at 11:00, at 15:00, or as a
re-run next week. So already-created orders and a fresh re-run always agree. An order that exists
is never retroactively deleted by a later change — a late pause is a fact about the future, not a
correction of the past.

This is why `resolveSubscriptionForDate(subscription, serviceDate, asOf)` takes `asOf` as a
parameter instead of reading the clock. Same input, same answer, forever. It also means I can test
the whole rule without a database.

---

## 3. Subscription history model

**Append-only JSONB arrays** on the subscription: `pauses`, `skips`, `address_history`. Every entry
carries `recorded_at` (when we found out) next to its business dates (when it applies). Nothing is
ever updated or deleted.

```
address_history: [
  { id: "a1", address: "H-9, Sector 137", effective_from: "2025-01-01", recorded_at: "2025-01-01T..." },
  { id: "a2", address: "B-22, Sector 62", effective_from: "2025-08-15", recorded_at: "2025-08-10T..." }
]
```

Two time axes is the point. `effective_from` answers "which address applies on 12 Aug".
`recorded_at` answers "did we know at the cut-off". The brief's question needs both.

**Alternatives:**

- *Just update the row.* Obvious, and it destroys the exact property being asked for.
- *Versioned side-tables* (`subscription_pauses`, etc.). This is the more scalable answer and it's
  what I'd move to at real volume. I didn't do it here because this data is only ever read as part
  of one subscription — never queried across subscriptions, never joined, never aggregated. Three
  tables and their joins would be structure with no reader.
- *Event-sourcing the subscription.* Correct, and too much. Rebuilding state from a log on every
  generation run is real cost for a guarantee the array already gives me.

**Trade-off I'm accepting:** the arrays aren't indexed and they grow forever. "Which subscriptions
are paused today" can't use an index — it means scanning and resolving in application code. That's
the first thing that breaks at scale, and it's in `SCALING.md`.

**Undoing a pause.** A pause added by mistake still has to be revocable, but deleting it breaks
history. So a cancellation is itself an appended entry: `{ id, cancels: "<original id>",
recorded_at }` goes into the same array. The resolver treats an entry as active only if its own
`recorded_at` is before the cut-off **and** no cancellation that is also before the cut-off points
at it. So cancelling a pause after a day's cut-off has passed doesn't un-pause that day.

---

## 4. Idempotency, and the job dying at 60%

**A unique index, not application logic.** `orders` has `UNIQUE (subscription_id, service_date)`
and generation inserts with `ON CONFLICT (subscription_id, service_date) DO NOTHING`.


**Partial failure.** Each order is its own auto-committed statement. I deliberately did **not**
wrap the day in one transaction. So if the job dies after 60%, those 60% are committed and durable,
and the re-run inserts the missing 40% and no-ops the rest. No cleanup, no compensation.

Wrapping the day in a transaction actually makes this worse: the 60% gets rolled back and has to be
redone, and the transaction holds locks for its entire runtime.

**Alternatives:**

- *Check-then-insert in app code.* Classic race. Two instances both read "doesn't exist", both
  insert.
- *Advisory lock on the date.* It works, but then correctness depends on every future caller
  remembering to take the lock. The index doesn't need anyone's cooperation.
- *An `idempotency_keys` table.* Right tool for a general-purpose API. Here
  `(subscription_id, service_date)` already **is** the natural key, so a synthetic one would just
  add a table and a failure mode.

Covered by `tests/generation.test.js`: re-run, simulated crash mid-way, and two concurrent runs over
20 subscriptions.

---

## 5. Concurrency — pessimistic, and why not optimistic

I went **pessimistic**: `SELECT ... FOR UPDATE`, and `FOR UPDATE SKIP LOCKED` for claiming.

The deciding factor is what happens under contention, not on the happy path. The scenario is N
riders hitting the last order at the same instant. With optimistic locking all N read version 1,
all N try to write version 2, one wins and **N−1 get a conflict and have to retry** — and their
retries contend again. That's a retry storm exactly when the system is busiest.

`SKIP LOCKED` turns that around. The loser doesn't fail and retry, it **skips the locked row and
moves to the next candidate inside the same query**. So:

- 20 riders, 1 order → 1 winner, 19 clean "nothing available" (204). No retries.
- 10 riders, 10 orders → 10 different orders in one pass. No conflicts.

Where I use what:

| Operation | Mechanism | Why |
|---|---|---|
| `claimNextOrder` | `FOR UPDATE SKIP LOCKED LIMIT 1` | Any unclaimed order will do, so skipping a contended row is better than waiting for it |
| `applyTransition` | `SELECT ... FOR UPDATE` | One specific order, so it has to serialise. There's no other row to skip to |
| `addSubscriptionEvent` | `SELECT ... FOR UPDATE` | Read-modify-write on a JSONB array. Without it, two concurrent appends lose one |
| Generation | no lock | The unique index already covers it |

Optimistic locking would be the right call in a read-heavy system where write conflicts are rare.
This is the opposite — writes are the contended path and conflicts are expected at the lunch rush.

Two guarantees live in the schema rather than in code:

```sql
CREATE UNIQUE INDEX deliveries_one_active_per_order ON deliveries (order_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX deliveries_one_active_per_rider ON deliveries (rider_id) WHERE released_at IS NULL;
```

The first is the "never two riders on one order" requirement. The second stops one rider holding
two orders, which is what a double-tap on a bad connection would otherwise do. Both hold even if I
get the application code wrong.

---

## 6. Rider timeout / lease, and how a dead rider's order recovers

**15-minute lease on the claim, renewed by any contact from the phone, released lazily.**

1. On claim, `deliveries` gets a row with `expires_at = now() + 15min` and a `claim_id`.
2. Every 15s the phone contacts the server (heartbeat, or a location ping once out for delivery).
   Each contact pushes `expires_at` to `now() + 15min` again. It's a rolling window, not a
   countdown.
3. Before any claim attempt, a CTE releases every delivery past its `expires_at`
   (`release_reason = 'EXPIRED'`) and clears that order's `rider_id`. It's immediately claimable.
4. The old claim row is marked released, never deleted. The `claim_id` then acts as a fencing
   token.

**Why lazy release instead of a sweeper.** I didn't want correctness depending on a cron process
staying alive. The only moment a stale lease matters is when someone wants to claim, so I do the
release there, in the same transaction as the claim. A sweeper would be an optimisation, never a
requirement, and it's one more thing that can die quietly.

**The fencing token is what actually prevents a double delivery.** A lease alone isn't enough. The
ghost rider's phone wakes up an hour later and posts "delivered" for an order someone else has
already delivered. So every transition is checked against the current active claim, and a stale
`claim_id` gets `409 STALE_CLAIM`. Without that the customer gets charged twice.

Manual override still exists: ops can move any order from the dashboard without a rider header, and
that path skips the claim check on purpose.

---

## 7. Billing vs fulfilment

**Prepaid wallet, charged per-day at the moment of delivery.** Top-ups are credits, the charge is a
debit on the `DELIVERED` transition, inside the same transaction as the status change.

**Is a paused day billed? No** — a paused day never becomes an order, and only delivered orders get
charged. The billing rule falls out of the generation rule instead of being a second rule that can
disagree with it.

**A late pause is billed.** The order exists, the food was cooked, it gets delivered and the wallet
is debited. That's the entire point of having a cut-off.

**Why not per-cycle upfront:** better cash flow, worse correctness. Every pause, skip and failed
delivery would become a refund, and refunds are the hardest money path to keep right — partial
amounts, proration, double-refunds. Charging on delivery means nothing delivered = nothing charged,
so that whole class of bug doesn't exist. Charging on `CONFIRMED` has the same refund problem.
Post-paid has real credit risk with no way to stop serving a non-payer.

**Known weakness:** there's no balance check before delivery, so a wallet can go negative. The right
fix is a balance gate at generation time (don't create tomorrow's order if the wallet can't cover
it, and warn before the cut-off), not a block at delivery — refusing to complete an order whose food
the rider is already holding doesn't help anyone.

I define **on-time as delivered before 14:00 IST** on the service date, measured from the
server-recorded `delivered_at`, not a phone clock.

---

## 8. Payments — signature, duplicates, ordering, and exactly-once

**Signature.** HMAC-SHA256 over `timestamp + "." + rawBody`, compared with `timingSafeEqual`, with
a 5-minute timestamp window. Three details that matter:

- I sign the **raw bytes**, captured with `express.json({ verify })` before parsing. Signing a
  re-serialised object compares a different byte string than the sender signed, because key order
  and whitespace don't survive a parse/stringify round trip.
- `timingSafeEqual` rather than `===`, so response time can't leak the expected signature.
- The timestamp is inside the signed material, so a captured request can't be replayed with a fresh
  timestamp.

**Duplicates.** `provider_event_id` has a partial unique index and the insert is
`ON CONFLICT DO NOTHING`. A duplicate returns `{ duplicate: true }` with **200, not an error** — a
provider that gets an error will retry forever. "I already have this" is a success.

**Out of order.** This one I handled by not creating the problem. Each event is an independent
ledger row and the balance is a sum, so the events commute — `TOPUP(500)` then `REFUND(200)` gives
the same balance as the reverse. There's no precedence rule to get wrong because there's no mutable
state to race over.

Related: I don't store a wallet balance. Balance is always `SUM(credits) − SUM(debits)`, computed at
read time. Storing a total alongside the rows it summarises gives you two sources of truth that
drift on any partial write, and then you need a reconciliation check for the drift your own design
created. The cost is that summing is O(rows) and will eventually need materialising — but that's a
performance problem with a known fix, traded against a correctness problem without one.

**Why true exactly-once isn't achievable.** Exactly-once *delivery* is impossible over a network —
it's the Two Generals problem. The provider can never tell "not processed" from "processed, ack
lost", so it has to retry, and any retry can duplicate. Nothing I write on my side changes that.

What is achievable, and what I built, is **at-least-once delivery + idempotent processing =
effectively-once side effects**. The network can deliver the event three times; the table will hold
one row, because the unique index says so. The duplicate gets absorbed at the storage layer, which
is the only layer that can absorb it atomically.

---

## 9. Mobile offline / retry / conflict strategy

**A persistent outbox in SQLite on the device.** Every state-changing action is written to disk
*before* any network call, then drained by a single-flight worker. There's exactly one path from
the UI to the server — I deleted the direct-call thunks once the outbox landed so nothing can
bypass it.

Flow: tap → row written as `QUEUED` with an idempotency key generated **once** → worker takes the
oldest row, marks it `SENDING`, calls the API → the result is classified → the UI renders the row's
state, not the rider's intent.

Four outcomes:

| Outcome | When | What happens |
|---|---|---|
| `CONFIRMED` | 2xx, or `alreadyApplied`, or a claim that found nothing | Settled |
| `CONFLICT` | 409 (`STALE_CLAIM`, `INVALID_TRANSITION`, `RIDER_OFFLINE`) | Settled, never retried, explained in plain words |
| `DEAD` | 4xx a retry can't fix (404, 400) | Settled, surfaced |
| `RETRY` | timeout, network error, 5xx | Stays queued, backs off, resent with the same key |

**Safe retry — why a timeout is `RETRY` and never a failure.** A timeout means *unknown*, not
failed. The request may have reached the server and been applied with only the response lost. If I
mark it failed I lose a delivery that actually happened; if I retry it as a new action I apply it
twice. The only safe move is to resend the same action with the same key and let the server tell me
it already happened, which it does — `200 { alreadyApplied: true }`, which classifies as
`CONFIRMED`. Same argument as the webhook in §8, just on the other side of the wire.

**Conflict resolution rule:** *the server is always right; the app never overwrites server state, it
explains the difference and re-reads the truth.* After every drain the app calls `refreshMe()` and
renders what the server says. So if the rider marks an order delivered offline while ops cancelled
it, the queued action comes back `409 INVALID_TRANSITION { current: 'CANCELLED' }`, the row settles
as a conflict saying "Cancelled by ops while you were offline", and the order leaves the screen
because the server no longer reports it. Nothing dropped silently, nothing forced through.

**Strict FIFO with head-of-line blocking.** A stalled action blocks the ones behind it. That looks
like a limitation but it's the requirement: `OUT_FOR_DELIVERY` then `DELIVERED` is a causal chain,
and letting `DELIVERED` overtake a stuck pickup would send a transition the state machine has to
reject — turning a network problem into a conflict I manufactured myself.

**Crash recovery.** Rows stuck in `SENDING` when the app dies are reset to `QUEUED` on boot. A
`SENDING` row is one whose outcome is unknown, which is the same case as a timeout.

**Why no idempotency-key middleware on the server.** Both endpoints are already idempotent by
construction. `claimNextOrder` hands a rider who already holds a claim that same claim back rather
than a second order, enforced by the per-rider partial unique index. `applyTransition` returns
`alreadyApplied` for a repeat from the same rider, and still `409 STALE_CLAIM` for a different one.
The key lives on the device where it stops a double tap; the server's guarantee comes from state,
which is stronger because it also holds for a client that never sends a key.

Covered by 12 headless tests in `frontend/rider-app/tests/outbox.test.js`.

---

## 10. Real-time approach

**Polling everywhere.** Rider app: 10s state refresh, 10s outbox drain, 15s heartbeat or location
tick. Dashboard: 5s.

I considered WebSockets and rejected them for the rider app specifically, because the hard
requirement there is surviving a *bad* network and a socket is worse at that than a request. A
dropped socket needs reconnect logic, backoff, resubscription, and a catch-up path for what was
missed while disconnected. A poll that fails is just the next poll. The outbox already gives me
durability; a socket would add a second, weaker channel with its own failure modes.

Nothing here needs sub-second latency either. The lunch window is hours and the lease is 15 minutes,
so 5–10s sits well inside every deadline that actually exists. Push notifications are bonus-only in
the brief and would add Expo tokens and platform credentials for no correctness gain.

What would change my mind: the bonus "track my order" map genuinely wants a socket, because a marker
that jumps every 10s looks broken. I'd add one for that read path only and still leave every write
on HTTP + outbox.

**Location deliberately sits outside the outbox.** Pings buffer in memory, capped at about two
minutes, and get dropped beyond that. The dividing line I used: if losing the message loses
*information* it goes to disk, if it only loses *freshness* it stays in memory. A stale GPS position
is worthless, so there's no reason to durably queue one.

**Two signals, not one.** During `PREPARING` the phone sends a heartbeat with no coordinates and no
permission prompt. Only once `OUT_FOR_DELIVERY` does it send real GPS. Both renew the lease through
the same function. This gives me the brief's "share live location while on a delivery" literally,
without going back to the bug in §11.1.

---

## 11. Two places where the obvious approach is wrong

### 11.1 The lease has to measure silence, not elapsed time — I got this wrong first

The obvious implementation, and the one I shipped before catching it: claim sets
`expires_at = now() + 15min`, and when that passes the order is reclaimable.

It's wrong because it measures how long the rider has *had* the order, when the requirement is about
a rider who "goes dark (never updates it)". That's absence of contact, which is a completely
different quantity. A rider standing in the restaurant while a slow kitchen takes 20 minutes is not
a ghost, but the naive lease takes the order off them anyway — and the next rider inherits the same
doomed 15-minute window, so the order can bounce between riders while the food is never picked up.
It gets worse the busier the kitchen is, which is when you can least afford it.

What I did instead: every contact from the phone renews the lease. The backend was already right —
`renewLease` doesn't care what status the order is in — the app was the bug, because it only sent
pings after pickup. I moved pings to start at claim time, and split the signal in two so that
"prove you're alive" isn't tied to "share your location".

Two tests pin it down: a rider waiting on a slow kitchen keeps the order as long as the phone
reports, and the same order *is* reclaimed once the phone goes quiet. Both are needed — the first
one alone would pass under the naive design too.

### 11.2 AsyncStorage is the React Native default and it silently breaks the requirement

The obvious implementation for persisting the offline queue is `AsyncStorage`. It's the default RN
persistence layer and it's what most tutorials reach for.

It's wrong here because AsyncStorage is a key-value blob store with no transactions. The whole queue
sits under one key, so every append is a read-modify-write of the entire array. Let two of those
interleave — the drain worker settling one row while the rider taps and appends another — and one of
them is gone. That's a lost update, and it breaks "an offline action must not be silently lost"
directly. Worse, it fails invisibly: no error, no crash, just an action that never happened and a
rider who thinks it did.

What I did instead: `expo-sqlite` with a real schema, row-level writes, and a `UNIQUE` index on the
idempotency key. Two writers touch different rows, and enqueueing the same action twice is
impossible rather than unlikely.

One consequence worth mentioning: the outbox core imports no React and no Expo, it takes an adapter.
That's why the offline behaviour is proven by 12 headless tests in about 300ms against an in-memory
adapter that can simulate an app kill, instead of needing a device.
