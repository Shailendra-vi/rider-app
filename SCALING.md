# SCALING.md

Today: a few hundred subscriptions, one Postgres, one API process. 100x means ~50,000 orders a day
and a ledger growing by millions of rows a year.

## What breaks first

1. **Generation is a serial loop** — one INSERT per subscription. 50,000 round trips before the
   lunch window opens.
2. **The JSONB history arrays** — unindexed and growing forever. Generation pulls every
   subscription's full pause/skip/address history into Node to resolve one day.
3. **Balance is a `SUM` over the whole ledger on every read.** Gets slower every day.
4. **`rider_locations`** — a ping every 15s per delivering rider, nothing ever deleted. Biggest
   table by far.
5. **`claimNextOrder` has no geography.** A Noida rider gets a Greater Noida order.
6. **Polling** — a few thousand riders at 10s each, mostly to hear "nothing changed".

## What I'd change

- **Batch the generation inserts** — multi-row `ON CONFLICT DO NOTHING` in chunks of ~1000.
  Same guarantee, 50 round trips instead of 50,000. Do this first.
- **Move history to versioned side tables** — indexed on `(subscription_id, recorded_at)`.
  Eligibility becomes a SQL join instead of a full load into JS. Same append-only model, just
  stored where it can be indexed.
- **Materialise the balance as a cache, not a second source of truth** — checkpoint row plus the
  sum since. Reconciliation still recomputes from the ledger and verifies it.
- **Partition `rider_locations` monthly, drop after 90 days**, and keep a one-row-per-rider
  "latest position" table for the dashboard.
- **Zone-scoped claiming** — a zone column plus a partial index on
  `(zone, status, created_at) WHERE rider_id IS NULL`. `SKIP LOCKED` works the same over a smaller
  set.
- **Read replicas** for reconciliation and dashboard queries. Writes stay on the primary.

## What I deliberately did not build

- **Ops metrics (Part 1.F).** Reconciliation is built; the metrics endpoint isn't. It's an
  aggregate query with no correctness risk, so it lost to the parts that could actually be wrong.
  This is the biggest gap in the submission.
- **Real auth.** Not required by the brief. `X-Rider-Id` is checked but not authenticated; swapping
  in JWT changes only where the id is read from.
- **Kitchen automation.** `PLACED → CONFIRMED → PREPARING` is a manual ops action, which the brief
  allows.
- **A wallet balance gate.** The right place is generation time — don't create tomorrow's order if
  the balance can't cover it — not at delivery, where the rider already has the food.
- **Push, map, customer app.** Bonus only.

## Known weaknesses

- **A wallet can go negative** — the gate above isn't built.
- **`recordLocations` inserts one row per ping in a loop** instead of one multi-row insert.
- **Orphan charges get reported on every date you reconcile**, since a charge with no order has no
  service date to filter on.
- **CORS is wide open** — deliberate for local dev, would be pinned in a real deployment.
- **Heartbeats every 15s are chattier than a 15-minute lease needs.** 60s would still leave 15
  missed contacts of margin.
- **The test suite flaked once** — 3 failures in one run, then 5 clean runs of all 55. Not
  reproduced. I'd want it found before trusting CI.
