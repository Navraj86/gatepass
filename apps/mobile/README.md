# Gatepass Scan

The door staff's scanner as a native app, built with Expo. Staff sign in, pick an event and point the camera at a ticket's QR code. A full-screen colour and a buzz give the answer: valid, already scanned, refunded, wrong event or not a ticket.

The server makes every decision. The app calls the same two endpoints as the web scanner (`GET /api/staff/events`, `POST /api/staff/scan`), so check-in stays exactly-once even when several phones scan the same ticket at the same moment.

## Run it on your phone

1. Install **Expo Go** from the App Store or Google Play.
2. From the repository root:

   ```sh
   pnpm install
   pnpm dev:mobile
   ```

3. Scan the QR code in the terminal: with the Camera app on iPhone, or from inside Expo Go on Android. The phone and the computer must be on the same Wi-Fi; if they cannot be, run `pnpm --filter @gatepass/mobile start --tunnel`.
4. Sign in as `staff@gatepass.test` with the password `gatepass`.

The app talks to the live site by default. To use an API on your computer instead, create `apps/mobile/.env` with `EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:4000` (not `localhost`, which on the phone means the phone itself) and restart `pnpm dev:mobile`.

## How it signs in

A phone app has no browser cookie jar, so it uses the same session in a different envelope:

1. `POST /api/auth/sign-in/email` returns the session token in the `set-auth-token` header (Better Auth's bearer plugin).
2. The app keeps it in the phone's Keychain or Keystore (`expo-secure-store`) and sends `Authorization: Bearer <token>` on every request, with cookies turned off.
3. The API turns the bearer token back into its normal session, so `requireRole` and the staff checks run unchanged. The token is signed by the server, so a forged one is refused.

Signing out deletes the session on the server, so the token stops working everywhere.

## Files

```text
App.tsx                      which screen shows, the saved session, Android's back button
src/api.ts                   the only place that calls the network
src/session.ts               saves and clears the token in secure storage
src/screens/SignInScreen     email and password; refuses attendee accounts
src/screens/EventsScreen     the events this account can scan, with check-in counts
src/screens/ScannerScreen    camera, verdict, typed codes, the last few scans
src/ui.tsx, src/theme.ts     header, button and field, in the website's colours
```
