import React, { useState } from "react";
import { login, requestPasswordReset } from "../../lib/auth";
import * as Icons from "../common/Icons";
import { toast } from "../../lib/toast";

interface LoginProps {
  onSuccess: () => void;
  onRegisterClick: () => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-bg-subtle)",
  border: "1px solid var(--color-border)",
  borderRadius: 9,
  padding: "10px 12px",
  fontSize: 13,
  color: "var(--color-text)",
  fontFamily: "inherit",
  outline: "none",
};

/**
 * Sign-in card — the SIGN-IN block of LTV Desking PRO.dc.html. Auth wiring
 * (login(), toast, onSuccess/onRegisterClick) is preserved verbatim. The
 * surrounding brand lockup + grid background live in AuthLayout. [dc-redesign]
 */
export const Login: React.FC<LoginProps> = ({ onSuccess, onRegisterClick }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<"idle" | "sent" | "error">("idle");

  const handleResetSubmit = async () => {
    const target = resetEmail.trim();
    if (!target) {
      toast.error("Please enter your email address");
      return;
    }
    setResetLoading(true);
    setResetStatus("idle");
    try {
      const ok = await requestPasswordReset(target);
      setResetStatus(ok ? "sent" : "error");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter both email and password");
      return;
    }

    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success("Welcome back!");
        onSuccess();
      } else {
        toast.error(result.error || "Invalid email or password");
      }
    } catch (error) {
      // Login failure surfaced via UI toast; detailed in Sentry via boundary.
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 12 /* --radius-xl — matches the Register card radius fix */,
        boxShadow: "var(--shadow-md)",
        padding: "28px 28px 30px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <span
          style={{
            fontSize: 11 /* uppercase mono kicker — 11px readable floor */,
            fontFamily: "var(--mono)",
            letterSpacing: "0.12em",
            color: "var(--color-text-subtle)",
          }}
        >
          SIGN IN
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
      </div>

      <label htmlFor="email" style={labelStyle}>
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="dc-input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={{ ...inputStyle, marginBottom: 15 }}
      />

      <label htmlFor="password" style={labelStyle}>
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="dc-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        style={{ ...inputStyle, marginBottom: 10 }}
      />

      <div style={{ textAlign: "right", marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => {
            setShowReset((v) => !v);
            setResetStatus("idle");
            if (!resetEmail && email) setResetEmail(email);
          }}
          style={{
            fontSize: 12,
            color: "var(--color-primary)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Forgot your password?
        </button>
      </div>

      {showReset && (
        <div
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            borderRadius: 9,
            padding: 12,
            marginBottom: 18,
          }}
        >
          <label htmlFor="reset-email" style={labelStyle}>
            Email for reset link
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              className="dc-input"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
            />
            <button
              type="button"
              onClick={handleResetSubmit}
              disabled={resetLoading}
              className="transition-colors"
              style={{
                background: "transparent",
                border: "1px solid var(--color-border-strong)",
                color: "var(--color-text)",
                borderRadius: 9,
                padding: "0 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: resetLoading ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: resetLoading ? 0.7 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {resetLoading ? "Sending…" : "Send link"}
            </button>
          </div>
          {resetStatus === "sent" && (
            <p
              role="status"
              style={{ fontSize: 12, color: "var(--color-success)", margin: "8px 0 0" }}
            >
              If an account exists for that address, a reset email is on its way.
            </p>
          )}
          {resetStatus === "error" && (
            <p
              role="alert"
              style={{ fontSize: 12, color: "var(--color-danger)", margin: "8px 0 0" }}
            >
              Could not send the reset email. Please try again, or contact your administrator.
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="transition-colors btn-primary"
        style={{
          width: "100%",
          border: "none",
          borderRadius: 9,
          padding: 11,
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: loading ? 0.75 : 1,
        }}
      >
        {loading ? <Icons.SpinnerIcon className="animate-spin h-5 w-5" /> : "Enter the desk"}
      </button>

      <div
        style={{
          textAlign: "center",
          marginTop: 18,
          fontSize: 12,
          color: "var(--color-text-muted)",
        }}
      >
        No account yet?{" "}
        <button
          type="button"
          onClick={onRegisterClick}
          style={{
            color: "var(--color-primary)",
            textDecoration: "none",
            cursor: "pointer",
            fontWeight: 600,
            background: "none",
            border: "none",
            fontFamily: "inherit",
            fontSize: 12,
          }}
        >
          Register dealer
        </button>
      </div>
    </form>
  );
};
