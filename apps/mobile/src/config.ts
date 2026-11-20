/**
 * The API the app talks to. It defaults to the live site; to use an API on your computer,
 * put `EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:4000` in apps/mobile/.env.
 * Expo copies EXPO_PUBLIC_* variables into the app when it bundles it.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://gatepass.navraj.dev").replace(/\/+$/, "");
