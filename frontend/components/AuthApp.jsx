"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GenerateForm } from "@/components/GenerateForm";
import { RuntimeSettingsCard } from "@/components/RuntimeSettingsCard";
import { AdminOverview } from "@/components/AdminOverview";
import { AuthPanel } from "@/components/AuthPanel";
import { formatDateTime, joinWithDot } from "@/lib/display-format";
import { useWorkspaceSession } from "@/hooks/useWorkspaceSession";

const MAX_AVATAR_DIMENSION = 512;
const AVATAR_OUTPUT_QUALITY = 0.82;

function getUserInitials(user) {
  const source = String(user?.name || user?.email || "U").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function ProfileStat({ label, value, tone = "default" }) {
  const toneClass = tone === "accent"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-stone-200 bg-white text-ink";

  return (
    <div className={`rounded-[1.2rem] border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-lg font-medium">{value}</p>
    </div>
  );
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to process the selected image."));
    };
    image.src = objectUrl;
  });
}

function canvasToDataUrl(canvas, type, quality) {
  return canvas.toDataURL(type, quality);
}

async function optimizeAvatarFile(file) {
  const image = await loadImageElement(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image processing is not supported in this browser.");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const preferredType = file.type === "image/png" ? "image/png" : "image/webp";
  let dataUrl = canvasToDataUrl(canvas, preferredType, AVATAR_OUTPUT_QUALITY);

  if (dataUrl.length > 1_500_000) {
    dataUrl = canvasToDataUrl(canvas, "image/jpeg", 0.72);
  }

  return dataUrl;
}

function ProfilePanel({
  user,
  billing,
  sessions,
  recentJobs,
  onUpdateProfile,
  onChangePassword,
  profileSaving,
  passwordSaving
}) {
  const [displayName, setDisplayName] = useState(user?.name || "");
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || "");
  const [pendingAvatarDataUrl, setPendingAvatarDataUrl] = useState(undefined);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setDisplayName(user?.name || "");
    setAvatarPreview(user?.avatar_url || "");
    setPendingAvatarDataUrl(undefined);
    setRemoveAvatar(false);
  }, [user?.name, user?.avatar_url]);

  const initials = useMemo(() => getUserInitials(user), [user]);
  const recentJobCount = recentJobs?.jobs?.length || 0;
  const currentSessionCount = sessions?.filter((session) => !session.revoked_at).length || 0;

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setProfileError("");
    setProfileSuccess("");

    if (!file.type.startsWith("image/")) {
      setProfileError("Please choose a valid image file.");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await optimizeAvatarFile(file);
      setAvatarPreview(dataUrl);
      setPendingAvatarDataUrl(dataUrl);
      setRemoveAvatar(false);
    } catch (fileError) {
      setProfileError(fileError.message);
    } finally {
      event.target.value = "";
    }
  }

  function handleRemoveAvatar() {
    setAvatarPreview("");
    setPendingAvatarDataUrl("");
    setRemoveAvatar(true);
    setProfileError("");
    setProfileSuccess("");
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    const nextName = String(displayName || "").trim();
    if (!nextName) {
      setProfileError("Please enter a username to display on your account.");
      return;
    }

    try {
      const response = await onUpdateProfile({
        name: nextName,
        avatarUrl: pendingAvatarDataUrl,
        removeAvatar
      });
      setProfileSuccess(response?.message || "Profile updated successfully.");
      setPendingAvatarDataUrl(undefined);
      setRemoveAvatar(false);
    } catch (requestError) {
      setProfileError(requestError.message);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    try {
      const response = await onChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(response?.message || "Password updated successfully.");
    } catch (requestError) {
      setPasswordError(requestError.message);
    }
  }

  return (
    <section className="surface-card space-y-6 p-6 md:p-7">
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-[1.8rem] border border-stone-200 bg-gradient-to-br from-white via-stone-50 to-emerald-50 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt={`${user?.name || user?.email || "User"} profile`}
                  className="h-16 w-16 rounded-[1.4rem] object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-ink font-display text-2xl text-white shadow-sm">
                  {initials}
                </div>
              )}
              <div>
                <p className="section-kicker">Profile</p>
                <h3 className="mt-2 font-display text-3xl text-ink">Account settings</h3>
                <p className="mt-2 text-sm text-stone-600">Manage how your workspace identifies you and how your account stays secure.</p>
              </div>
            </div>
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-500">
              {user.role || "user"}
            </span>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <ProfileStat label="Available Credits" value={billing?.balance ?? 0} tone="accent" />
            <ProfileStat label="Active Sessions" value={currentSessionCount} />
            <ProfileStat label="Recent Requests" value={recentJobCount} />
          </div>

          <div className="mt-5 rounded-[1.3rem] border border-stone-200 bg-white/80 px-4 py-4 text-sm text-stone-600">
            <p className="font-medium text-ink">Account summary</p>
            <p className="mt-2">{user.name || "No username set yet"}</p>
            <p className="mt-1">{user.email}</p>
            <p className="mt-2 text-xs text-stone-500">Member since {formatDateTime(user.created_at)}</p>
          </div>
        </div>

        <div className="rounded-[1.8rem] border border-stone-200 bg-white p-5 md:p-6">
          <p className="section-kicker">Security Notes</p>
          <h4 className="mt-2 font-display text-2xl text-ink">Good account hygiene</h4>
          <div className="mt-4 space-y-3 text-sm text-stone-600">
            <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50 px-4 py-3">
              Use a unique password you do not reuse on other sites.
            </div>
            <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50 px-4 py-3">
              Password changes sign out your other saved sessions automatically.
            </div>
            <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50 px-4 py-3">
              Revoke unknown sessions below if you ever notice suspicious activity.
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[1.6rem] border border-stone-200 bg-white p-5">
          <div>
            <p className="text-sm font-medium text-ink">Public profile</p>
            <p className="mt-1 text-xs text-stone-500">This username appears in your workspace and billing details.</p>
          </div>
          <form className="mt-5 space-y-4" onSubmit={handleProfileSubmit}>
            <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 px-4 py-4">
              <div className="flex flex-wrap items-center gap-4">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Profile preview"
                    className="h-20 w-20 rounded-[1.5rem] object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-ink font-display text-3xl text-white">
                    {initials}
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink">Profile photo</p>
                  <p className="text-xs text-stone-500">PNG, JPG, WEBP, or GIF. Large photos are resized automatically before upload.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition hover:bg-stone-100"
                    >
                      Upload photo
                    </button>
                    {avatarPreview ? (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm text-red-700 transition hover:bg-red-50"
                      >
                        Remove photo
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>
            </div>

            <label className="block text-sm text-stone-700">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-stone-500">Username</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={80}
                className="w-full rounded-[1.1rem] border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                placeholder="Enter your display name"
              />
              <span className="mt-2 block text-right text-[11px] uppercase tracking-[0.14em] text-stone-400">
                {String(displayName || "").trim().length}/80
              </span>
            </label>
            <div className="rounded-[1.1rem] border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500">
              Email address is currently fixed to protect billing history and session identity.
            </div>
            {profileError ? <p className="text-sm text-red-700">{profileError}</p> : null}
            {profileSuccess ? <p className="text-sm text-emerald-700">{profileSuccess}</p> : null}
            <button
              type="submit"
              disabled={profileSaving}
              className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {profileSaving ? "Saving profile..." : "Save profile"}
            </button>
          </form>
        </article>

        <article className="rounded-[1.6rem] border border-stone-200 bg-white p-5">
          <div>
            <p className="text-sm font-medium text-ink">Password & security</p>
            <p className="mt-1 text-xs text-stone-500">Changing your password will sign out your other saved sessions automatically.</p>
          </div>
          <form className="mt-5 space-y-4" onSubmit={handlePasswordSubmit}>
            <label className="block text-sm text-stone-700">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-stone-500">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-[1.1rem] border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                placeholder="Enter current password"
              />
            </label>
            <label className="block text-sm text-stone-700">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-stone-500">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-[1.1rem] border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                placeholder="At least 8 characters"
              />
            </label>
            <label className="block text-sm text-stone-700">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-stone-500">Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-[1.1rem] border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                placeholder="Re-enter new password"
              />
            </label>
            <div className="rounded-[1.1rem] border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500">
              Use 8+ characters and avoid reusing old passwords from other apps.
            </div>
            {passwordError ? <p className="text-sm text-red-700">{passwordError}</p> : null}
            {passwordSuccess ? <p className="text-sm text-emerald-700">{passwordSuccess}</p> : null}
            <button
              type="submit"
              disabled={passwordSaving}
              className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-ink transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {passwordSaving ? "Updating password..." : "Change password"}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}

function SessionPanel({ sessions, onRevoke, onLogoutAll, sessionRevokingId, loggingOutAll }) {
  const [showSessions, setShowSessions] = useState(false);

  return (
    <section className="surface-card space-y-4 p-6 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-kicker">Security</p>
          <h3 className="mt-2 font-display text-3xl text-ink">Active sessions</h3>
          <p className="mt-2 text-sm leading-7 text-stone-600">Review recent device sessions and revoke anything that should no longer stay signed in.</p>
        </div>
        <button
          type="button"
          onClick={onLogoutAll}
          disabled={loggingOutAll}
          className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition hover:bg-stone-50 disabled:opacity-60"
        >
          {loggingOutAll ? "Signing out..." : "Logout All Sessions"}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
        <div>
          <p className="font-medium text-ink">Saved sessions</p>
          <p className="mt-1 text-xs text-stone-500">{sessions.length} session{sessions.length === 1 ? "" : "s"} currently available to review.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSessions((value) => !value)}
          className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition hover:bg-stone-50"
        >
          {showSessions ? "Hide Sessions" : "View Sessions"}
        </button>
      </div>

      {showSessions ? (
        <div className="space-y-3 text-sm text-stone-700">
          {sessions.length ? sessions.map((session) => (
            <div key={session.id} className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{session.is_current ? "Current session" : "Signed-in device"}</p>
                  <p className="mt-1 text-xs text-stone-500">{joinWithDot([
                    session.user_agent || "Unknown user agent",
                    session.ip_address || "Unknown IP"
                  ])}</p>
                  <p className="mt-2 text-xs text-stone-500">{joinWithDot([
                    `Created ${formatDateTime(session.created_at)}`,
                    `Last used ${formatDateTime(session.last_used_at)}`,
                    `Expires ${formatDateTime(session.expires_at)}`
                  ])}</p>
                </div>
                {!session.revoked_at ? (
                  <button
                    type="button"
                    onClick={() => onRevoke(session.id)}
                    disabled={sessionRevokingId === session.id}
                    className="rounded-full border border-red-300 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {sessionRevokingId === session.id ? "Revoking" : "Revoke"}
                  </button>
                ) : <span className="rounded-full bg-stone-200 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">Revoked</span>}
              </div>
            </div>
          )) : <p className="text-stone-500">No active refresh sessions found.</p>}
        </div>
      ) : null}
    </section>
  );
}

function BillingPanel({ billing, onPurchase, purchasingPlanId }) {
  const [showCreditHistory, setShowCreditHistory] = useState(false);

  if (!billing) return null;

  return (
    <section className="surface-card space-y-5 p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Credits</p>
          <h3 className="mt-2 font-display text-3xl text-ink">Subscription wallet</h3>
          <p className="mt-2 text-sm leading-7 text-stone-600">Use credits for note generation and top up with Razorpay whenever your balance runs low.</p>
        </div>
        <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">Available credits</p>
          <p className="mt-2 font-display text-4xl text-emerald-900">{billing.balance}</p>
          <p className="mt-2 text-xs text-emerald-800">{billing.noteGenerationCreditCost} credits per note generation</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {billing.plans?.map((plan) => (
          <article key={plan.id} className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{plan.name}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-500">{plan.highlight}</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">{plan.credits} credits</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-stone-600">{plan.description}</p>
            <p className="mt-5 font-display text-3xl text-ink">INR {plan.amountInr}</p>
            <button
              type="button"
              onClick={() => onPurchase(plan.id)}
              disabled={!billing.billingEnabled || purchasingPlanId === plan.id}
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-accent px-4 py-3 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {purchasingPlanId === plan.id ? "Opening checkout..." : billing.billingEnabled ? "Buy credits" : "Payments not configured"}
            </button>
          </article>
        ))}
      </div>

      <div className="rounded-[1.6rem] border border-stone-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Recent credit activity</p>
            <p className="mt-1 text-xs text-stone-500">Starter credits, purchases, note charges, and refunds all appear here.</p>
          </div>
          <div className="flex flex-wrap items-start gap-3 md:items-center">
            <div className="text-right text-xs text-stone-500">
              <p>Lifetime credited: {billing.lifetimeCredited}</p>
              <p>Lifetime spent: {billing.lifetimeSpent}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreditHistory((value) => !value)}
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition hover:bg-stone-50"
            >
              {showCreditHistory ? "Hide Credit History" : "View Credit History"}
            </button>
          </div>
        </div>

        {showCreditHistory ? (
          <div className="mt-4 space-y-3">
            {billing.recentLedger?.length ? billing.recentLedger.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-stone-200 bg-stone-50 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{entry.description}</p>
                  <p className="mt-1 text-xs text-stone-500">{formatDateTime(entry.created_at)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${Number(entry.delta) >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {Number(entry.delta) >= 0 ? `+${entry.delta}` : entry.delta} credits
                </span>
              </div>
            )) : <p className="text-sm text-stone-500">No credit activity yet.</p>}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function AuthApp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const {
    mode,
    setMode,
    user,
    settings,
    billing,
    overview,
    sessions,
    recentJobsBootstrap,
    loading,
    error,
    setError,
    authenticate,
    logout,
    logoutAll,
    updateProfile,
    changePassword,
    refreshBilling,
    purchasePlan,
    loadMoreUsers,
    loadMoreJobs,
    loadMoreLogs,
    changeUserRole,
    cancelOverviewJob,
    revokeSession,
    revokeAdminSession,
    replayDeadLetter,
    loadingMoreUsers,
    loadingMoreJobs,
    loadingMoreLogs,
    roleUpdatingUserId,
    jobCancellingId,
    sessionRevokingId,
    deadLetterReplayingId,
    loggingOutAll,
    purchasingPlanId,
    profileSaving,
    passwordSaving
  } = useWorkspaceSession();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await authenticate({ mode, name, email, password });
      setPassword("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handlePurchasePlan(planId) {
    setError("");
    try {
      await purchasePlan(planId);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (loading) {
    return <div className="surface-card p-6">Loading account...</div>;
  }

  if (!user) {
    return (
      <AuthPanel
        mode={mode}
        setMode={setMode}
        name={name}
        setName={setName}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        error={error}
        onSubmit={handleSubmit}
      />
    );
  }

  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-6">
      <section className="surface-card flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-3">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={`${user.name || user.email} avatar`} className="h-12 w-12 rounded-[1rem] object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-ink font-display text-lg text-white">
              {getUserInitials(user)}
            </div>
          )}
          <div>
            <p className="section-kicker">Workspace</p>
            <h2 className="mt-1 font-display text-3xl text-ink">Welcome back</h2>
            <p className="mt-1 text-sm text-stone-700">Signed in as {user.name || user.email}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-500">Role: {user.role || "user"}</p>
          </div>
        </div>
        <button className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition hover:bg-stone-50" onClick={logout}>Logout</button>
      </section>

      {error ? <div className="surface-card border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}

      <ProfilePanel
        user={user}
        billing={billing}
        sessions={sessions}
        recentJobs={recentJobsBootstrap}
        onUpdateProfile={updateProfile}
        onChangePassword={changePassword}
        profileSaving={profileSaving}
        passwordSaving={passwordSaving}
      />

      <BillingPanel
        billing={billing}
        onPurchase={handlePurchasePlan}
        purchasingPlanId={purchasingPlanId}
      />

      <SessionPanel
        sessions={sessions}
        onRevoke={revokeSession}
        onLogoutAll={logoutAll}
        sessionRevokingId={sessionRevokingId}
        loggingOutAll={loggingOutAll}
      />

      {isAdmin ? (
        <>
          <AdminOverview
            overview={overview}
            loadingMoreUsers={loadingMoreUsers}
            loadingMoreJobs={loadingMoreJobs}
            loadingMoreLogs={loadingMoreLogs}
            roleUpdatingUserId={roleUpdatingUserId}
            jobCancellingId={jobCancellingId}
            sessionRevokingId={sessionRevokingId}
            deadLetterReplayingId={deadLetterReplayingId}
            onLoadMoreUsers={loadMoreUsers}
            onLoadMoreJobs={loadMoreJobs}
            onLoadMoreLogs={loadMoreLogs}
            onUpdateUserRole={changeUserRole}
            onCancelJob={cancelOverviewJob}
            onRevokeSession={revokeAdminSession}
            onReplayDeadLetter={replayDeadLetter}
          />
          <RuntimeSettingsCard settings={settings} />
        </>
      ) : null}

      <GenerateForm billing={billing} onRefreshBilling={refreshBilling} initialRecentJobs={recentJobsBootstrap} />
    </div>
  );
}
