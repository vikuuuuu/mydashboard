const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const STORAGE_KEY = "firebase_auth_user";

const parseResponse = async (response) => {
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message?.replaceAll("_", " ") || "Authentication failed";
    throw new Error(message);
  }

  return data;
};

const ensureFirebaseKey = () => {
  if (!FIREBASE_API_KEY) {
    throw new Error("Missing NEXT_PUBLIC_FIREBASE_API_KEY in environment variables");
  }
};

export const signInWithEmail = async (email, password) => {
  ensureFirebaseKey();

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const data = await parseResponse(response);
  const user = {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    loginAt: Date.now(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  return user;
};

export const signUpWithEmail = async (email, password) => {
  ensureFirebaseKey();

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  return parseResponse(response);
};

export const getCurrentUser = () => {
  if (typeof window === "undefined") return null;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

export const signOutUser = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
};
