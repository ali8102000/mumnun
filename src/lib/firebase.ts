import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string,
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
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY as string,
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
