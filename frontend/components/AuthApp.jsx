"use client";

import { useState } from "react";
import { GenerateForm } from "@/components/GenerateForm";
import { RuntimeSettingsCard } from "@/components/RuntimeSettingsCard";
import { AdminOverview } from "@/components/AdminOverview";
import { AuthPanel } from "@/components/AuthPanel";
import { formatDateTime, joinWithDot } from "@/lib/display-format";
import { useWorkspaceSession } from "@/hooks/useWorkspaceSession";

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
    purchasingPlanId
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
        <div>
          <p className="section-kicker">Workspace</p>
          <h2 className="mt-1 font-display text-3xl text-ink">Welcome back</h2>
          <p className="mt-1 text-sm text-stone-700">Signed in as {user.name || user.email}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-500">Role: {user.role || "user"}</p>
        </div>
        <button className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition hover:bg-stone-50" onClick={logout}>Logout</button>
      </section>

      {error ? <div className="surface-card border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}

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
