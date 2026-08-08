import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  Play, Check, RotateCcw, SkipForward, Pause, X, Flame, Award, ChevronRight,
} from "lucide-react";

/* ---------- design tokens ---------- */
const C = {
  bg: "#14160f",
  bg2: "#1b1e15",
  surface: "#23271b",
  surfaceHi: "#2d3223",
  line: "#3a4030",
  sand: "#cfc8a6",
  sandHi: "#efe9cf",
  sandDim: "#8f8a6b",
  amber: "#e0902f",
  amberHi: "#f2a83e",
  olive: "#8aa05a",
  oliveHi: "#a3ba6d",
  rust: "#b5502f",
  ink: "#0e0f0a",
};
const DISPLAY = "'Oswald','Arial Narrow',sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
const BODY = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";

const KEY = "mc_pt_state_v1";
const PHASE_LEN = 12;

/* ---------- program logic ---------- */
const ACCESSORIES = [
  { name: "Reverse Lunges", cue: "Step back, knee soft, drive through front heel.", type: "rep", unit: "per leg", base: (b) => b.squats * 0.45 },
  { name: "Mountain Climbers", cue: "Hips low, quick knees, steady breath.", type: "timed" },
  { name: "Flutter Kicks", cue: "Low back pinned to floor, small fast kicks.", type: "timed" },
  { name: "Burpees", cue: "Chest to deck, full stand at the top.", type: "rep", unit: "reps", burpee: true },
];

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function generateSession(nInPhase, baseline) {
  const p = clamp((nInPhase - 1) / (PHASE_LEN - 1), 0, 1);
  const sets = 4 + Math.round(p);            // 4 -> 5
  const repF = 0.4 + 0.2 * p;                // 0.40 -> 0.60
  const plankF = 0.5 + 0.25 * p;             // 0.50 -> 0.75
  const timedSec = Math.round(20 + 25 * p);  // 20s -> 45s
  const rep = (x) => Math.max(3, Math.round(x * repF));

  const ex = [];
  ex.push({ name: "Push-ups", cue: "Body in a straight line, chest to a fist off the deck.", type: "rep", unit: "reps", sets, reps: rep(baseline.pushups), restSec: 75 });
  ex.push({ name: "Air Squats", cue: "Hips below knees, chest tall, heels down.", type: "rep", unit: "reps", sets, reps: rep(baseline.squats), restSec: 60 });
  if (baseline.pullups && baseline.pullups > 0) {
    ex.push({ name: "Pull-ups", cue: "Full hang to chin over the bar. Use a band if needed.", type: "rep", unit: "reps", sets, reps: Math.max(2, Math.round(baseline.pullups * repF)), restSec: 90 });
  }
  ex.push({ name: "Sit-ups", cue: "Controlled up and down, no yanking the neck.", type: "rep", unit: "reps", sets, reps: rep(baseline.situps), restSec: 60 });
  ex.push({ name: "Plank", cue: "Squeeze glutes and core, flat back, breathe.", type: "timed", unit: "sec", sets: 3, seconds: Math.max(15, Math.round(baseline.plankSec * plankF)), restSec: 45 });

  const acc = ACCESSORIES[(nInPhase - 1) % ACCESSORIES.length];
  if (acc.type === "rep") {
    const reps = acc.burpee ? Math.max(5, Math.round(5 + 7 * p)) : Math.max(4, Math.round(acc.base(baseline) * repF));
    ex.push({ name: acc.name, cue: acc.cue, type: "rep", unit: acc.unit, sets: 3, reps, restSec: 60 });
  } else {
    ex.push({ name: acc.name, cue: acc.cue, type: "timed", unit: "sec", sets: 3, seconds: timedSec, restSec: 60 });
  }

  // optional conditioning finisher
  const finisher = { name: "Finisher — Burpees", cue: "Max effort, smooth pace. Optional.", type: "timed", unit: "sec", sets: 1, seconds: Math.round(40 + 20 * p), restSec: 0, optional: true };

  return { nInPhase, ex, finisher };
}

function expandToSteps(session) {
  const steps = [{ type: "warmup" }];
  const work = [];
  session.ex.forEach((e) => {
    for (let s = 0; s < e.sets; s++) {
      work.push({
        type: e.type === "rep" ? "work_rep" : "work_timed",
        name: e.name, cue: e.cue, unit: e.unit,
        reps: e.reps, seconds: e.seconds,
        setIndex: s + 1, setCount: e.sets, restSec: e.restSec,
      });
    }
  });
  work.forEach((w, i) => {
    steps.push(w);
    if (i < work.length - 1 && w.restSec > 0) steps.push({ type: "rest", seconds: w.restSec });
  });
  const f = session.finisher;
  steps.push({ type: "finisher_prompt", finisher: f });
  steps.push({ type: "cooldown" });
  return steps;
}

function sessionVolume(session) {
  return session.ex.reduce((t, e) => (e.type === "rep" ? t + e.sets * e.reps : t), 0);
}

/* ---------- storage ---------- */
async function loadState() {
  try {
    const r = await window.storage.get(KEY);
    if (r && r.value) return JSON.parse(r.value);
  } catch (_) {}
  return { profile: null, history: [] };
}
async function saveState(state) {
  try { await window.storage.set(KEY, JSON.stringify(state)); } catch (e) { console.error("save failed", e); }
}

/* ---------- small ui atoms ---------- */
function Stamp({ children, color = C.amber }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 11, letterSpacing: 2, color,
      border: `1.5px solid ${color}`, padding: "3px 8px", borderRadius: 3,
      textTransform: "uppercase", fontWeight: 700, display: "inline-block",
    }}>{children}</span>
  );
}
function Eyebrow({ children }) {
  return <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: C.sandDim, textTransform: "uppercase" }}>{children}</div>;
}

/* segmented countdown ring */
function TimerRing({ total, left, color, label, sub }) {
  const R = 92, CIRC = 2 * Math.PI * R;
  const frac = total > 0 ? left / total : 0;
  return (
    <div style={{ position: "relative", width: 220, height: 220, margin: "0 auto" }}>
      <svg width="220" height="220" viewBox="0 0 220 220" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="110" cy="110" r={R} fill="none" stroke={C.line} strokeWidth="10" />
        <circle cx="110" cy="110" r={R} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="butt" strokeDasharray={`${CIRC * frac} ${CIRC}`}
          style={{ transition: "stroke-dasharray 0.95s linear" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, color: C.sandDim }}>{label}</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 64, fontWeight: 600, color: C.sandHi, lineHeight: 1 }}>{left}</div>
        {sub && <div style={{ fontFamily: MONO, fontSize: 11, color: C.sandDim, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

const btn = (bg, fg, extra = {}) => ({
  fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: 1.5,
  textTransform: "uppercase", background: bg, color: fg, border: "none",
  borderRadius: 4, padding: "14px 22px", cursor: "pointer", width: "100%",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  ...extra,
});
const ghostBtn = {
  fontFamily: MONO, fontSize: 13, letterSpacing: 1, color: C.sandDim,
  background: "transparent", border: `1px solid ${C.line}`, borderRadius: 4,
  padding: "10px 16px", cursor: "pointer", textTransform: "uppercase",
};

/* ---------- main ---------- */
export default function App() {
  const [screen, setScreen] = useState("loading");
  const [state, setState] = useState({ profile: null, history: [] });

  // workout runtime
  const [session, setSession] = useState(null);
  const [steps, setSteps] = useState([]);
  const [idx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [paused, setPaused] = useState(false);
  const [didFinisher, setDidFinisher] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    (async () => {
      const s = await loadState();
      setState(s);
      setScreen(s.profile ? "home" : "onboard");
    })();
  }, []);

  const persist = useCallback((next) => { setState(next); saveState(next); }, []);

  const beep = () => {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      const o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = "square"; o.frequency.value = 660;
      g.gain.setValueAtTime(0.04, a.currentTime);
      o.start(); o.stop(a.currentTime + 0.18);
    } catch (_) {}
  };

  /* timer engine for rest + timed steps */
  const step = steps[idx];
  useEffect(() => {
    if (!step) return;
    if (step.type === "rest") { setTimeLeft(step.seconds); setPaused(false); }
    else if (step.type === "work_timed") { setTimeLeft(step.seconds); setPaused(false); }
    else setTimeLeft(null);
  }, [idx, step?.type]);

  useEffect(() => {
    if (timeLeft == null || paused || screen !== "workout") return;
    if (timeLeft <= 0) return;
    tickRef.current = setTimeout(() => {
      setTimeLeft((t) => {
        if (t <= 1) { beep(); setTimeout(() => advance(), 60); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearTimeout(tickRef.current);
  }, [timeLeft, paused, screen]);

  const advance = () => {
    setIdx((i) => {
      const ni = i + 1;
      if (ni >= steps.length) { finishWorkout(); return i; }
      return ni;
    });
  };

  const startWorkout = () => {
    const completed = state.history.length;
    const baseSet = state.profile.baselineSetAt ?? 0;
    const nInPhase = completed - baseSet + 1;
    const sess = generateSession(nInPhase, state.profile.baseline);
    setSession(sess);
    setSteps(expandToSteps(sess));
    setIdx(0);
    setDidFinisher(false);
    setScreen("workout");
  };

  const finishWorkout = () => {
    const completed = state.history.length;
    const baseSet = state.profile.baselineSetAt ?? 0;
    const nInPhase = completed - baseSet + 1;
    const entry = {
      date: new Date().toISOString(),
      n: completed + 1,
      nInPhase,
      volume: sessionVolume(session),
      finisher: didFinisher,
      exercises: session.ex.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, seconds: e.seconds, unit: e.unit })),
    };
    persist({ ...state, history: [...state.history, entry] });
    setScreen("summary");
  };

  /* ---------- screens ---------- */
  const Shell = ({ children, max = 480 }) => (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.sand, fontFamily: BODY,
      backgroundImage: `radial-gradient(circle at 50% -10%, ${C.bg2}, ${C.bg})` }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box} button:focus-visible{outline:2px solid ${C.amberHi};outline-offset:2px}
        input{outline:none} input:focus{border-color:${C.amber}!important}
        @media (prefers-reduced-motion: reduce){*{transition:none!important}}`}</style>
      <div style={{ maxWidth: max, margin: "0 auto", padding: "24px 18px 60px" }}>{children}</div>
    </div>
  );

  if (screen === "loading") {
    return <Shell><div style={{ fontFamily: MONO, color: C.sandDim, marginTop: 80, textAlign: "center", letterSpacing: 2 }}>LOADING PT CARD…</div></Shell>;
  }

  /* ---- ONBOARD ---- */
  if (screen === "onboard") return <Onboard onDone={(baseline) => {
    const next = { profile: { baseline, baselineSetAt: 0, startedAt: new Date().toISOString() }, history: state.history };
    persist(next); setScreen("home");
  }} Shell={Shell} existing={state.profile?.baseline} />;

  /* ---- HOME ---- */
  if (screen === "home") {
    const completed = state.history.length;
    const baseSet = state.profile.baselineSetAt ?? 0;
    const inPhase = completed - baseSet;
    const retestDue = inPhase >= PHASE_LEN;
    const weekCount = state.history.filter((h) => (Date.now() - new Date(h.date)) < 7 * 864e5).length;
    const last = state.history[state.history.length - 1];
    const chartData = state.history.slice(-14).map((h) => ({ s: h.n, vol: h.volume }));

    return (
      <Shell>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <Eyebrow>Field PT · Calisthenics</Eyebrow>
            <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, margin: "4px 0 0", color: C.sandHi, letterSpacing: 1, lineHeight: 0.95 }}>
              DAILY<br />ORDERS
            </h1>
          </div>
          <Stamp color={retestDue ? C.amber : C.olive}>{retestDue ? "RE-TEST" : "READY"}</Stamp>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 22 }}>
          <Stat label="Sessions" value={completed} icon={<Award size={14} />} />
          <Stat label="This week" value={weekCount} icon={<Flame size={14} />} />
          <Stat label="Phase" value={`${clamp(inPhase + 1, 1, PHASE_LEN)}/${PHASE_LEN}`} />
        </div>

        <button style={{ ...btn(C.amber, C.ink), marginTop: 22, fontSize: 22, padding: "18px" }} onClick={startWorkout}>
          <Play size={20} fill={C.ink} /> {completed === 0 ? "Begin Session 1" : `Start Session ${completed + 1}`}
        </button>

        {retestDue && (
          <div style={{ marginTop: 14, background: C.surface, border: `1px solid ${C.amber}`, borderRadius: 6, padding: 14 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, color: C.amberHi, letterSpacing: 1, textTransform: "uppercase" }}>Re-test recommended</div>
            <p style={{ fontSize: 13, color: C.sandDim, margin: "6px 0 10px" }}>You've cleared a full {PHASE_LEN}-session block. Re-run the baseline so the loads recalibrate to your new level.</p>
            <button style={ghostBtn} onClick={() => setScreen("onboard")}>Re-test baseline</button>
          </div>
        )}

        {chartData.length >= 2 && (
          <div style={{ marginTop: 24, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 6, padding: "16px 8px 8px 0" }}>
            <div style={{ padding: "0 0 8px 16px" }}><Eyebrow>Total reps / session</Eyebrow></div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="s" stroke={C.sandDim} tick={{ fontSize: 11, fontFamily: MONO, fill: C.sandDim }} />
                <YAxis stroke={C.sandDim} tick={{ fontSize: 11, fontFamily: MONO, fill: C.sandDim }} width={32} />
                <Tooltip contentStyle={{ background: C.ink, border: `1px solid ${C.line}`, borderRadius: 4, fontFamily: MONO, fontSize: 12 }} labelStyle={{ color: C.sand }} />
                <Line type="monotone" dataKey="vol" stroke={C.amber} strokeWidth={2.5} dot={{ r: 3, fill: C.amber }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {last && (
          <button onClick={() => setScreen("history")} style={{ ...ghostBtn, width: "100%", marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>View log · last {new Date(last.date).toLocaleDateString()}</span><ChevronRight size={16} />
          </button>
        )}

        <div style={{ marginTop: 28, textAlign: "center" }}>
          <button onClick={() => setScreen("onboard")} style={{ background: "none", border: "none", color: C.sandDim, fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer", textDecoration: "underline" }}>edit baseline</button>
        </div>
      </Shell>
    );
  }

  /* ---- WORKOUT ---- */
  if (screen === "workout") {
    const total = steps.filter((s) => s.type.startsWith("work")).length;
    const doneWork = steps.slice(0, idx).filter((s) => s.type.startsWith("work")).length;

    let body = null;
    if (step.type === "warmup") body = (
      <Block title="Warm-up" tag="2–3 MIN" color={C.olive}
        items={["20× Jumping jacks", "10× Arm circles each way", "10× Leg swings per leg", "10× Bodyweight good mornings", "10× Slow air squats"]}
        cta="Begin work" onCta={advance} />
    );
    else if (step.type === "cooldown") body = (
      <Block title="Cool-down" tag="STRETCH" color={C.olive}
        items={["Chest/door stretch — 30s", "Quad stretch — 30s/side", "Hamstring reach — 30s", "Child's pose — 45s", "Slow breathing — 1 min"]}
        cta="Finish session" onCta={advance} />
    );
    else if (step.type === "finisher_prompt") {
      const f = step.finisher;
      body = (
        <div style={{ textAlign: "center" }}>
          <Stamp color={C.rust}>Optional finisher</Stamp>
          <h2 style={{ fontFamily: DISPLAY, fontSize: 34, color: C.sandHi, margin: "16px 0 4px", letterSpacing: 1 }}>{f.name}</h2>
          <p style={{ color: C.sandDim, fontSize: 14, maxWidth: 320, margin: "0 auto 24px" }}>{f.cue} {f.seconds}s of work.</p>
          <button style={btn(C.amber, C.ink)} onClick={() => {
            setDidFinisher(true);
            setSteps((s) => { const c = [...s]; c.splice(idx + 1, 0, { type: "work_timed", name: f.name, cue: f.cue, unit: "sec", seconds: f.seconds, setIndex: 1, setCount: 1, restSec: 0 }); return c; });
            advance();
          }}>Do it · {f.seconds}s</button>
          <button style={{ ...ghostBtn, width: "100%", marginTop: 10 }} onClick={advance}>Skip — go to cool-down</button>
        </div>
      );
    }
    else if (step.type === "rest") body = (
      <div style={{ textAlign: "center" }}>
        <TimerRing total={step.seconds} left={timeLeft ?? step.seconds} color={C.olive} label="RECOVER" sub="next set loading" />
        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button style={{ ...ghostBtn, flex: 1 }} onClick={() => setPaused((p) => !p)}>{paused ? <Play size={14} /> : <Pause size={14} />} {paused ? "Resume" : "Pause"}</button>
          <button style={{ ...ghostBtn, flex: 1 }} onClick={advance}><SkipForward size={14} /> Skip rest</button>
        </div>
      </div>
    );
    else if (step.type === "work_timed") body = (
      <div style={{ textAlign: "center" }}>
        <Eyebrow>Set {step.setIndex} / {step.setCount}</Eyebrow>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 36, color: C.sandHi, margin: "6px 0 18px", letterSpacing: 1 }}>{step.name}</h2>
        <TimerRing total={step.seconds} left={timeLeft ?? step.seconds} color={C.amber} label="WORK" />
        <p style={{ color: C.sandDim, fontSize: 13, maxWidth: 320, margin: "20px auto 0" }}>{step.cue}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button style={{ ...ghostBtn, flex: 1 }} onClick={() => setPaused((p) => !p)}>{paused ? <Play size={14} /> : <Pause size={14} />} {paused ? "Resume" : "Pause"}</button>
          <button style={{ ...ghostBtn, flex: 1 }} onClick={advance}><Check size={14} /> Done early</button>
        </div>
      </div>
    );
    else if (step.type === "work_rep") body = (
      <div style={{ textAlign: "center" }}>
        <Eyebrow>Set {step.setIndex} / {step.setCount}</Eyebrow>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 38, color: C.sandHi, margin: "6px 0 4px", letterSpacing: 1 }}>{step.name}</h2>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10, margin: "18px 0" }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 96, fontWeight: 700, color: C.amber, lineHeight: 1 }}>{step.reps}</span>
          <span style={{ fontFamily: MONO, fontSize: 16, color: C.sandDim, letterSpacing: 1 }}>{step.unit}</span>
        </div>
        <p style={{ color: C.sandDim, fontSize: 14, maxWidth: 320, margin: "0 auto 28px" }}>{step.cue}</p>
        <button style={btn(C.amber, C.ink, { fontSize: 22, padding: "18px" })} onClick={advance}><Check size={20} /> Set complete</button>
      </div>
    );

    return (
      <Shell>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Stamp>Session {String(state.history.length + 1).padStart(3, "0")}</Stamp>
          <button onClick={() => { if (confirm("Abort this session? Progress won't be saved.")) setScreen("home"); }} style={{ background: "none", border: "none", color: C.sandDim, cursor: "pointer" }}><X size={20} /></button>
        </div>
        {/* progress bar */}
        <div style={{ height: 4, background: C.line, borderRadius: 2, marginBottom: 30, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${total ? (doneWork / total) * 100 : 0}%`, background: C.amber, transition: "width .4s" }} />
        </div>
        {body}
      </Shell>
    );
  }

  /* ---- SUMMARY ---- */
  if (screen === "summary") {
    const last = state.history[state.history.length - 1];
    return (
      <Shell>
        <div style={{ textAlign: "center", marginTop: 30 }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", border: `2px solid ${C.olive}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <Check size={40} color={C.oliveHi} />
          </div>
          <h1 style={{ fontFamily: DISPLAY, fontSize: 40, color: C.sandHi, margin: "20px 0 2px", letterSpacing: 1 }}>MISSION COMPLETE</h1>
          <Eyebrow>Session {last.n} logged</Eyebrow>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 26 }}>
          <Stat label="Total reps" value={last.volume} />
          <Stat label="Movements" value={last.exercises.length} />
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, marginTop: 16 }}>
          {last.exercises.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < last.exercises.length - 1 ? `1px solid ${C.line}` : "none", fontFamily: MONO, fontSize: 13 }}>
              <span style={{ color: C.sand }}>{e.name}</span>
              <span style={{ color: C.sandDim }}>{e.sets} × {e.type === "timed" || e.unit === "sec" ? `${e.seconds}s` : `${e.reps} ${e.unit}`}</span>
            </div>
          ))}
        </div>
        <button style={{ ...btn(C.amber, C.ink), marginTop: 22 }} onClick={() => setScreen("home")}>Back to orders</button>
      </Shell>
    );
  }

  /* ---- HISTORY ---- */
  if (screen === "history") {
    return (
      <Shell>
        <button onClick={() => setScreen("home")} style={{ ...ghostBtn, marginBottom: 18 }}>← Back</button>
        <h1 style={{ fontFamily: DISPLAY, fontSize: 34, color: C.sandHi, letterSpacing: 1, margin: "0 0 16px" }}>TRAINING LOG</h1>
        {state.history.length === 0 && <p style={{ color: C.sandDim }}>No sessions logged yet.</p>}
        {[...state.history].reverse().map((h, i) => (
          <div key={i} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 6, padding: "12px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 20, color: C.sandHi }}>Session {h.n}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.sandDim }}>{new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {new Date(h.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{h.finisher ? " · finisher ✓" : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 24, color: C.amber }}>{h.volume}</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.sandDim, letterSpacing: 1 }}>REPS</div>
            </div>
          </div>
        ))}
      </Shell>
    );
  }

  return null;
}

/* ---------- subcomponents ---------- */
function Stat({ label, value, icon }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 6, padding: "12px 14px" }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: C.sandDim, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4 }}>{icon}{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 600, color: C.sandHi, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function Block({ title, tag, items, cta, onCta, color }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 32, color: C.sandHi, letterSpacing: 1, margin: 0 }}>{title}</h2>
        <Stamp color={color}>{tag}</Stamp>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden", marginBottom: 22 }}>
        {items.map((it, i) => (
          <div key={i} style={{ padding: "13px 16px", borderBottom: i < items.length - 1 ? `1px solid ${C.line}` : "none", fontFamily: MONO, fontSize: 14, color: C.sand }}>{it}</div>
        ))}
      </div>
      <button style={btn(C.amber, C.ink)} onClick={onCta}>{cta}<ChevronRight size={18} /></button>
    </div>
  );
}

function Onboard({ onDone, Shell, existing }) {
  const [f, setF] = useState({
    pushups: existing?.pushups ?? "",
    situps: existing?.situps ?? "",
    squats: existing?.squats ?? "",
    plankSec: existing?.plankSec ?? "",
    pullups: existing?.pullups ?? "",
  });
  const fields = [
    { k: "pushups", label: "Push-ups", hint: "max in one comfortable set" },
    { k: "squats", label: "Air squats", hint: "max comfortable set" },
    { k: "situps", label: "Sit-ups", hint: "max comfortable set" },
    { k: "plankSec", label: "Plank hold (sec)", hint: "how long you can hold solid form" },
    { k: "pullups", label: "Pull-ups", hint: "leave 0 if no bar / can't yet" },
  ];
  const valid = ["pushups", "squats", "situps", "plankSec"].every((k) => Number(f[k]) > 0);

  return (
    <Shell>
      <Eyebrow>Step 1 · Baseline</Eyebrow>
      <h1 style={{ fontFamily: DISPLAY, fontSize: 38, color: C.sandHi, letterSpacing: 1, margin: "4px 0 10px", lineHeight: 1 }}>SET YOUR LINE</h1>
      <p style={{ color: C.sandDim, fontSize: 14, lineHeight: 1.5, marginBottom: 6 }}>
        Test each movement <strong style={{ color: C.sand }}>submaximally</strong> — stop 1–2 reps before your form would break. This isn't a max-out; it's the number every workout scales from. Warm up first, and stop on any sharp pain.
      </p>
      <div style={{ marginTop: 18 }}>
        {fields.map((fl) => (
          <div key={fl.k} style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 18, color: C.sandHi, letterSpacing: 0.5 }}>{fl.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.sandDim }}>{fl.hint}</span>
            </label>
            <input type="number" inputMode="numeric" value={f[fl.k]}
              onChange={(e) => setF({ ...f, [fl.k]: e.target.value })}
              placeholder="0"
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 4, padding: "12px 14px", color: C.sandHi, fontFamily: MONO, fontSize: 18 }} />
          </div>
        ))}
      </div>
      <button disabled={!valid} style={{ ...btn(valid ? C.amber : C.line, valid ? C.ink : C.sandDim, { marginTop: 8, cursor: valid ? "pointer" : "not-allowed" }) }}
        onClick={() => onDone({
          pushups: +f.pushups, situps: +f.situps, squats: +f.squats,
          plankSec: +f.plankSec, pullups: +f.pullups || 0,
        })}>
        Lock it in <ChevronRight size={18} />
      </button>
    </Shell>
  );
}
