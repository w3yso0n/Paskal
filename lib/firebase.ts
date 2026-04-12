import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"

function buildConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error("Firebase solo está disponible en el cliente")
  }
  const existing = getApps()[0]
  if (existing) return existing
  const firebaseConfig = buildConfig()
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
    throw new Error("Faltan variables NEXT_PUBLIC_FIREBASE_* en el entorno")
  }
  return initializeApp(firebaseConfig)
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp())
}

/** Analytics opcional; solo si el navegador lo soporta y hay measurementId */
export function initFirebaseAnalytics(): void {
  if (typeof window === "undefined") return
  const mid = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  if (!mid?.trim()) return
  void import("firebase/analytics").then(({ getAnalytics, isSupported }) => {
    void isSupported().then((supported) => {
      if (supported) getAnalytics(getFirebaseApp())
    })
  })
}
