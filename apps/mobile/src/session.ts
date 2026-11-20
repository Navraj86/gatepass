import * as SecureStore from "expo-secure-store";

/**
 * The sign-in token lives in the phone's Keychain (iOS) or Keystore (Android), not in plain
 * app storage, so other apps and backups cannot read it. Signing out deletes it.
 */
const KEY = "gatepass.session-token";

export const loadToken = () => SecureStore.getItemAsync(KEY);
export const saveToken = (token: string) => SecureStore.setItemAsync(KEY, token);
export const clearToken = () => SecureStore.deleteItemAsync(KEY);
