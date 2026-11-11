# Foundations

A personal habit tracker built on WHOOP data. It tracks the foundations of a
healthy body: running, strength, tennis, sleep and supplements.

It is a web app you add to your iPhone home screen. Until WHOOP is connected it
shows sample data, so you can look around first.

## What it does

- **Logs itself.** Workouts, sleep and recovery come from WHOOP. Only supplements are ticked by hand.
- **Full or minimum.** Each session has a minimum version that still counts (3 km easy, 15 minutes of strength). On a low-recovery day the app asks for the minimum.
- **Never miss twice.** A missed session stays open for the rest of the week. A missed night or supplement day gets one nudge, and a smaller ask after two misses in a row.
- **Consistency, not streaks.** A rolling 30-day percentage per habit. A miss lowers it slightly and never resets it.
- **Running month.** Kilometres against the 60 km goal, and how many km per week the rest of the month needs.
- **Your own evidence.** Compares your recovery and HRV after nights that hit a sleep target with nights that did not.
- **Weekly review.** Three questions each week; the one change you choose is shown at the top of the next week.

Goals, wake times and supplements live in `src/lib/config.ts`. The weekly plan
and the supplement cues can be changed in the app under Settings.

## Run it on your Mac

```
npm install
npm run dev
```

Open http://localhost:3000. `npm test` runs the tests.

## Put it online and connect WHOOP

These steps have not been run end to end with a real WHOOP account yet.

1. **Host it.** Import this GitHub repository into [Vercel](https://vercel.com) (free plan). Vercel builds the main branch, so this code has to be merged there first.
2. **Add storage.** In the Vercel project, add an Upstash Redis store from the Storage tab. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. **Create a WHOOP app.** In the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com), create an app with the scopes `read:recovery`, `read:workout`, `read:sleep` and `offline`, and the redirect URL `https://YOUR-APP-ADDRESS/api/whoop/callback`.
4. **Set the variables.** In Vercel, under Environment Variables, set `APP_PASSWORD`, `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET` (see `.env.example`), then redeploy.
5. **Connect.** Open the app, sign in with your password, go to Settings and choose Connect WHOOP.
6. **Add to home screen.** In Safari on your iPhone: Share, then Add to Home Screen.

## Good to know

- **Run distance.** WHOOP only has a distance when one was sent to it. If a run arrives without one, the app asks you for the km.
- **Apple Watch (optional).** An iPhone Shortcut can send a finished workout to `POST /api/ingest` with the header `Authorization: Bearer <INGEST_TOKEN>` and a body like `{"kind":"run","date":"2026-11-14","minutes":58,"km":10.2}`. If WHOOP recorded the same run, the distance is attached to it and nothing is counted twice.
- **Asleep time.** "Asleep by" uses the start of the sleep WHOOP recorded, which may or may not include time spent reading in bed.
- **Not built yet.** Push notifications.
