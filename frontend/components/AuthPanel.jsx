export function AuthPanel({
  mode,
  setMode,
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  error,
  onSubmit
}) {
  return (
    <section className="surface-card mx-auto max-w-5xl overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border-b border-stone-200/80 bg-[linear-gradient(180deg,rgba(15,118,110,0.08),rgba(255,255,255,0.3))] p-8 lg:border-b-0 lg:border-r lg:p-10">
          <p className="section-kicker">Sign In</p>
          <h2 className="mt-3 font-display text-5xl leading-tight text-ink">Your lecture workspace, ready when you are.</h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-stone-700">
            Log in to save note generations, reopen past jobs, inspect runtime settings, and build a consistent study archive.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-stone-300/70 bg-white/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Saved history</p>
              <p className="mt-2 text-sm text-stone-700">Reopen old note runs without losing context.</p>
            </div>
            <div className="rounded-[1.5rem] border border-stone-300/70 bg-white/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Diagnostics</p>
              <p className="mt-2 text-sm text-stone-700">See which models and providers are active right now.</p>
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10">
          <div className="mb-6 flex gap-3 rounded-full bg-stone-100 p-1">
            <button className={`rounded-full px-4 py-2 text-sm transition ${mode === "login" ? "bg-ink text-white shadow-sm" : "text-stone-600"}`} onClick={() => setMode("login")}>Login</button>
            <button className={`rounded-full px-4 py-2 text-sm transition ${mode === "register" ? "bg-ink text-white shadow-sm" : "text-stone-600"}`} onClick={() => setMode("register")}>Register</button>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            {mode === "register" ? (
              <input className="w-full rounded-full border border-stone-300 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-teal-700" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            ) : null}
            <input className="w-full rounded-full border border-stone-300 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-teal-700" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" className="w-full rounded-full border border-stone-300 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-teal-700" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <button className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-95">{mode === "login" ? "Login" : "Create account"}</button>
          </form>
        </div>
      </div>
    </section>
  );
}
