import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDsvSjzPIr4KyJ00dbIwTSczAMeQGeoTko",
  authDomain: "kafo-iraq.firebaseapp.com",
  projectId: "kafo-iraq",
  storageBucket: "kafo-iraq.firebasestorage.app",
  messagingSenderId: "519280841491",
  appId: "1:519280841491:web:3b05c309cacc9b488300e6",
  measurementId: "G-ZT52H353BD",
};

export const firebaseApp = initializeApp(firebaseConfig);

if (typeof window !== "undefined") {
  import("firebase/analytics")
    .then(({ getAnalytics, isSupported }) =>
      isSupported().then((ok) => {
        if (ok) getAnalytics(firebaseApp);
      })
    )
    .catch(() => {});
}

let messagingInstance: Messaging | null = null;

export function getFCM(): Messaging | null {
  if (typeof window === "undefined") return null;
  if (!messagingInstance) {
    try {
      messagingInstance = getMessaging(firebaseApp);
    } catch {
      messagingInstance = null;
    }
  }
  return messagingInstance;
}

export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window)) return null;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return null;
  const fcm = getFCM();
  if (!fcm) return null;
  try {
    const token = await getToken(fcm, {
      vapidKey: "BDxHJt9E92tCiIlVQa36Nrq6HBeY8ss7M",
    });
    return token;
  } catch {
    return null;
  }
}

export function onForegroundMessage(cb: (payload: any) => void): (() => void) | null {
  const fcm = getFCM();
  if (!fcm) return null;
  try {
    return onMessage(fcm, cb);
  } catch {
    return null;
  }
}
