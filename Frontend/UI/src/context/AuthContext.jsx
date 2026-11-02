import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi, setToken, clearToken, getToken } from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restore session on first load if a token is present
  const fetchMe = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const u = await authApi.me();
      setUser(u);
      connectSocket();
    } catch (err) {
      // Only clearToken on explicit 401 Unauthorized
      if (err.status === 401) {
        clearToken();
        setUser(null);
      } else {
        // Network errors or 5xx: keep token, set error state for retry
        setError(err.message || "Unable to reach server");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Handle auth:expired event from API interceptor
  useEffect(() => {
    const handleExpired = () => {
      clearToken();
      disconnectSocket();
      setUser(null);
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  const handleAuth = useCallback(({ user, token }) => {
    setToken(token);
    setUser(user);
    setError(null);
    connectSocket();
    return user;
  }, []);

  const login = useCallback(
    async (data) => handleAuth(await authApi.login(data)),
    [handleAuth]
  );

  const register = useCallback(
    async (data) => handleAuth(await authApi.register(data)),
    [handleAuth]
  );

  const logout = useCallback(() => {
    clearToken();
    disconnectSocket();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, error, retry: fetchMe, login, register, logout }}
    >
      {error && !user && getToken() ? (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface text-ink text-center">
          <div className="max-w-md p-8 rounded-3xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <h2 className="text-xl font-bold font-display text-ink mb-2">Connection Problem</h2>
            <p className="text-sm text-muted mb-6">
              {error}. We kept your login token intact so you don't have to sign in again.
            </p>
            <button
              onClick={fetchMe}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
            >
              Retry Connection
            </button>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
