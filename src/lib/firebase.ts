import { initializeApp } from "firebase/app";

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
