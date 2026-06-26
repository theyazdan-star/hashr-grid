import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db } from "../lib/firebase";
import { ref, onValue, set, get, push, query, limitToLast } from "firebase/database";

// ---------- Static member roster ----------
const MEMBERS = [
  { id: "amirmohammad", name: "امیرمحمد", initial: "ا" },
  { id: "saeed", name: "سعید", initial: "س" },
  { id: "amin", name: "امین پهلوان", initial: "پ" },
  { id: "morp", name: "مرپ", initial: "م" },
  { id: "mohammadreza", name: "محمدرضا", initial: "ر" },
  { id: "yazdan", name: "یزدان", initial: "ی" },
  { id: "mehdi", name: "مهدی", initial: "ه" },
  { id: "kaviani", name: "کاویانی", initial: "ک" },
  { id: "reza", name: "رضا", initial: "ض" },
];

const HUES = [328, 196, 268, 16, 152, 48, 300, 184, 8];

function hueForLevel(level) {
  const t = (level - 1) / 9;
  if (t <= 0.5) return 196 + (268 - 196) * (t / 0.5);
  return 268 + (328 - 268) * ((t - 0.5) / 0.5);
}

function glowColor(level, alpha = 1) {
  const h = hueForLevel(level);
  return `hsla(${h}, 95%, 60%, ${alpha})`;
}

function levelLabel(level) {
  if (level >= 9) return "بحرانی";
  if (level >= 7) return "پرخطر";
  if (level >= 5) return "متوسط";
  if (level >= 3) return "آرام";
  return "ساکت";
}

function seedLevels() {
  const obj = {};
  MEMBERS.forEach((m, i) => {
    obj[m.id] = 3 + ((i * 2) % 6);
  });
  return obj;
}

const MAX_HISTORY = 60;

// ---------- Animated number hook ----------
function useAnimatedNumber(target, duration = 600) {
  const [value, setValue] = useState(target);
  const raf = useRef(null);
  const start = useRef(null);
  const from = useRef(target);

  useEffect(() => {
    from.current = value;
    start.current = null;
    const startVal = from.current;
    const diff = target - startVal;
    if (diff === 0) return;

    function step(ts) {
      if (start.current === null) start.current = ts;
      const elapsed = ts - start.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(startVal + diff * eased);
      if (t < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    }
    raf.current = requestAnimationFrame(step);
    return () => raf.current && cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

// ---------- Particle field ----------
function ParticleField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let particles = [];
    let raf;
    let w, h;

    function resize() {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const COUNT = 46;
    particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      hue: Math.random() < 0.5 ? 328 : 196,
      a: 0.15 + Math.random() * 0.35,
    }));

    function tick() {
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${p.a})`;
        ctx.shadowColor = `hsla(${p.hue}, 90%, 60%, ${p.a})`;
        ctx.shadowBlur = 6;
        ctx.fill();
      });
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

// ---------- Live chart ----------
function LiveChart({ history, members, levels }) {
  const width = 1000;
  const height = 360;
  const padX = 40;
  const padY = 28;
  const maxLen = 40;

  const series = useMemo(() => {
    return members.map((m, idx) => {
      const points = history.map((snap) => snap[m.id] ?? levels[m.id] ?? 1);
      return { id: m.id, name: m.name, hue: HUES[idx % HUES.length], points };
    });
  }, [history, members, levels]);

  const n = Math.max(2, history.length);
  const stepX = (width - padX * 2) / (maxLen - 1);
  const yAt = (v) => height - padY - ((v - 1) / 9) * (height - padY * 2);

  const pathFor = (points) => {
    const visible = points.slice(-maxLen);
    const offset = maxLen - visible.length;
    return visible
      .map((v, i) => {
        const x = padX + (offset + i) * stepX;
        const y = yAt(v);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  };

  const gridLines = [1, 3, 5, 7, 9];

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" style={{ display: "block" }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`hsla(${s.hue},95%,60%,0.35)`} />
              <stop offset="100%" stopColor={`hsla(${s.hue},95%,60%,0)`} />
            </linearGradient>
          ))}
          <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {gridLines.map((g) => (
          <g key={g}>
            <line x1={padX} x2={width - padX} y1={yAt(g)} y2={yAt(g)} stroke="rgba(160,140,255,0.10)" strokeWidth="1" />
            <text x={padX - 12} y={yAt(g) + 4} fill="rgba(180,170,230,0.45)" fontSize="11" textAnchor="end" fontFamily="monospace">
              {g}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const d = pathFor(s.points);
          const visible = s.points.slice(-maxLen);
          const offset = maxLen - visible.length;
          const lastX = padX + (offset + visible.length - 1) * stepX;
          const lastY = yAt(visible[visible.length - 1]);
          return (
            <g key={s.id}>
              <path
                d={`${d} L${lastX.toFixed(2)},${height - padY} L${padX},${height - padY} Z`}
                fill={`url(#grad-${s.id})`}
                opacity="0.5"
              />
              <path
                d={d}
                fill="none"
                stroke={`hsl(${s.hue},95%,62%)`}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow-strong)"
                style={{ transition: "d 0.5s cubic-bezier(.4,0,.2,1)" }}
              />
              <circle cx={lastX} cy={lastY} r="5" fill={`hsl(${s.hue},95%,65%)`} filter="url(#glow-strong)">
                <animate attributeName="r" values="4.5;6.5;4.5" dur="2s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- Chaos meter ----------
function ChaosMeter({ levels }) {
  const values = Object.values(levels);
  const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / (values.length || 1);
  const spread = Math.sqrt(variance);
  const chaos = Math.min(100, Math.round((avg / 10) * 60 + (spread / 4.5) * 40));
  const animatedChaos = useAnimatedNumber(chaos, 700);
  const hue = hueForLevel(1 + (chaos / 100) * 9);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: `radial-gradient(circle at 80% 20%, hsla(${hue},90%,55%,0.35), transparent 60%)` }}
      />
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-xs tracking-widest text-white/50 font-mono">سنجش هرج‌ومرج گروه</span>
        <span className="text-2xl font-bold font-mono" style={{ color: `hsl(${hue},95%,65%)`, textShadow: `0 0 18px hsla(${hue},95%,60%,0.6)` }}>
          {Math.round(animatedChaos)}٪
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-white/5 overflow-hidden relative z-10">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${animatedChaos}%`,
            background: `linear-gradient(90deg, hsl(196,90%,55%), hsl(${hue},95%,60%))`,
            boxShadow: `0 0 16px hsla(${hue},95%,60%,0.7)`,
          }}
        />
      </div>
      <p className="mt-3 text-[11px] text-white/40 relative z-10 leading-5">
        برآمده از میانگین و پراکندگی سطوح حشر اعضا در لحظه
      </p>
    </div>
  );
}

// ---------- Member card ----------
function MemberCard({ member, level, isMe, onChangeLevel, justUpdated }) {
  const animated = useAnimatedNumber(level, 550);
  const hue = hueForLevel(level);
  const glow = glowColor(level, 0.55);

  return (
    <div
      className="relative rounded-2xl border p-4 backdrop-blur-xl transition-all duration-300"
      style={{
        borderColor: justUpdated ? `hsla(${hue},95%,65%,0.8)` : "rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        boxShadow: justUpdated
          ? `0 0 28px hsla(${hue},95%,55%,0.45), 0 0 0 1px hsla(${hue},95%,60%,0.4) inset`
          : "0 0 0 1px rgba(255,255,255,0.02) inset",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base shrink-0 relative"
          style={{
            background: `linear-gradient(135deg, hsla(${hue},90%,40%,0.35), hsla(${hue},90%,20%,0.15))`,
            border: `1px solid hsla(${hue},90%,60%,0.5)`,
            color: `hsl(${hue},95%,80%)`,
          }}
        >
          {member.initial}
          <span
            className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full border-2 border-[#0a0612]"
            style={{ background: `hsl(${hue},95%,60%)`, boxShadow: `0 0 8px hsl(${hue},95%,60%)` }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white/90 truncate">{member.name}</span>
            {isMe && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/30 shrink-0">
                خودت
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono tracking-wide" style={{ color: `hsl(${hue},85%,68%)` }}>
            {levelLabel(level)}
          </span>
        </div>
        <div className="text-left shrink-0">
          <div
            className="text-2xl font-extrabold font-mono leading-none tabular-nums"
            style={{ color: `hsl(${hue},95%,68%)`, textShadow: `0 0 16px ${glow}` }}
          >
            {animated.toFixed(0)}
          </div>
          <div className="text-[10px] text-white/30 font-mono">/ 10</div>
        </div>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${level * 10}%`,
            background: `linear-gradient(90deg, hsl(196,90%,55%), hsl(${hue},95%,60%))`,
            boxShadow: `0 0 10px hsla(${hue},95%,60%,0.7)`,
          }}
        />
      </div>

      {isMe && (
        <div className="mt-4 flex items-center gap-1.5 justify-between" dir="ltr">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((lvl) => (
            <button
              key={lvl}
              onClick={() => onChangeLevel(lvl)}
              className="flex-1 h-7 rounded-md text-[10px] font-mono font-bold transition-all duration-150 active:scale-90"
              style={{
                background: lvl <= level ? `hsl(${hueForLevel(lvl)},90%,55%)` : "rgba(255,255,255,0.06)",
                color: lvl <= level ? "#0a0612" : "rgba(255,255,255,0.4)",
                boxShadow: lvl === level ? `0 0 12px hsla(${hue},95%,60%,0.8)` : "none",
              }}
            >
              {lvl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Activity feed ----------
function ActivityFeed({ activity }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 h-full flex flex-col">
      <span className="text-xs tracking-widest text-white/50 font-mono mb-3 shrink-0">فعالیت زنده</span>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: 280 }}>
        {activity.length === 0 && <p className="text-white/30 text-xs leading-6">هنوز فعالیتی ثبت نشده</p>}
        {activity.map((a, i) => {
          const hue = hueForLevel(a.level);
          return (
            <div
              key={a.ts + "-" + i}
              className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-2 border border-white/5 bg-white/[0.02]"
              style={{ animation: "fadeIn 0.4s ease" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: `hsl(${hue},95%,60%)`, boxShadow: `0 0 6px hsl(${hue},95%,60%)` }}
              />
              <span className="text-white/70 truncate">
                <b className="text-white/90">{a.name}</b> به سطح <b style={{ color: `hsl(${hue},90%,70%)` }}>{a.level}</b> رسید
              </span>
              <span className="text-white/25 mr-auto shrink-0 font-mono text-[10px]" dir="ltr">
                {a.timeStr}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Login gate ----------
function LoginGate({ onSelect }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#07050d] px-4">
      <div className="absolute inset-0">
        <ParticleField />
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, rgba(157,0,255,0.18), transparent 55%), radial-gradient(circle at 100% 100%, rgba(255,0,153,0.12), transparent 50%)",
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-8 shadow-2xl">
        <h1
          className="text-3xl font-black text-center mb-1 tracking-tight"
          style={{
            background: "linear-gradient(90deg,#7ad8ff,#c46bff,#ff5fb0)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          نمودار حشر
        </h1>
        <p className="text-center text-white/40 text-xs mb-7 font-mono tracking-widest">REALTIME HASHR GRID</p>
        <p className="text-white/60 text-sm text-center mb-5">هویت خودت رو انتخاب کن</p>
        <div className="grid grid-cols-3 gap-2.5">
          {MEMBERS.map((m, idx) => (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] py-3.5 px-1 hover:border-fuchsia-400/50 hover:bg-white/[0.06] transition-all duration-200"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm"
                style={{
                  background: `linear-gradient(135deg, hsla(${HUES[idx % HUES.length]},90%,45%,0.4), transparent)`,
                  border: `1px solid hsla(${HUES[idx % HUES.length]},90%,60%,0.5)`,
                  color: `hsl(${HUES[idx % HUES.length]},95%,80%)`,
                }}
              >
                {m.initial}
              </div>
              <span className="text-[11px] text-white/70 text-center leading-tight">{m.name}</span>
            </button>
          ))}
        </div>
        <button onClick={() => onSelect(null)} className="w-full mt-5 text-xs text-white/40 hover:text-white/70 transition-colors">
          فقط مشاهده، بدون ورود
        </button>
      </div>
    </div>
  );
}

// ---------- Main App ----------
export default function HashrDashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [gatePassed, setGatePassed] = useState(false);
  const [levels, setLevels] = useState(() => seedLevels());
  const [activity, setActivity] = useState([]);
  const [history, setHistory] = useState([seedLevels()]);
  const [justUpdated, setJustUpdated] = useState(null);
  const [ready, setReady] = useState(false);

  // restore identity from localStorage on mount
  useEffect(() => {
    const saved = window.localStorage.getItem("hashr_user");
    const seenGate = window.localStorage.getItem("hashr_gate_passed");
    if (saved) setCurrentUser(saved);
    if (saved || seenGate) setGatePassed(true);
  }, []);

  // subscribe to levels in realtime
  useEffect(() => {
    const levelsRef = ref(db, "levels");
    const unsub = onValue(levelsRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setLevels(data);
        setHistory((h) => {
          const next = [...h, data];
          return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
        });
      } else {
        const seed = seedLevels();
        await set(levelsRef, seed);
      }
      setReady(true);
    });
    return () => unsub();
  }, []);

  // subscribe to last 12 activity entries
  useEffect(() => {
    const actQuery = query(ref(db, "activity"), limitToLast(12));
    const unsub = onValue(actQuery, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.values(data).sort((a, b) => b.ts - a.ts);
        setActivity(list);
        if (list.length) {
          setJustUpdated(list[0].id);
          setTimeout(() => setJustUpdated(null), 1400);
        }
      }
    });
    return () => unsub();
  }, []);

  const handleSelectUser = useCallback((id) => {
    setCurrentUser(id);
    setGatePassed(true);
    window.localStorage.setItem("hashr_gate_passed", "1");
    if (id) window.localStorage.setItem("hashr_user", id);
    else window.localStorage.removeItem("hashr_user");
  }, []);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setGatePassed(false);
    window.localStorage.removeItem("hashr_user");
    window.localStorage.removeItem("hashr_gate_passed");
  }, []);

  const handleChangeLevel = useCallback(
    async (level) => {
      if (!currentUser) return;
      const member = MEMBERS.find((m) => m.id === currentUser);
      const now = Date.now();
      try {
        await set(ref(db, `levels/${currentUser}`), level);
        const entry = {
          id: currentUser,
          name: member.name,
          level,
          ts: now,
          timeStr: new Date(now).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
        };
        await push(ref(db, "activity"), entry);
      } catch (e) {
        console.error("firebase sync failed", e);
      }
    },
    [currentUser]
  );

  const ranking = useMemo(() => [...MEMBERS].sort((a, b) => (levels[b.id] ?? 0) - (levels[a.id] ?? 0)), [levels]);

  const avgLevel = useMemo(() => {
    const vals = Object.values(levels);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [levels]);
  const animatedAvg = useAnimatedNumber(avgLevel, 700);

  const topMember = ranking[0];
  const topHue = topMember ? hueForLevel(levels[topMember.id] ?? 1) : 196;

  if (!ready) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#07050d]">
        <span className="text-white/30 text-sm font-mono tracking-widest">در حال اتصال…</span>
      </div>
    );
  }

  if (!gatePassed) {
    return <LoginGate onSelect={handleSelectUser} />;
  }

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden" style={{ background: "#07050d" }} dir="rtl">
      <style>{`
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(196,107,255,0.3); border-radius: 10px; }
      `}</style>

      <div className="fixed inset-0 pointer-events-none">
        <ParticleField />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 15% 0%, rgba(122,216,255,0.10), transparent 45%), radial-gradient(circle at 90% 10%, rgba(255,95,176,0.12), transparent 45%), radial-gradient(circle at 50% 100%, rgba(157,0,255,0.10), transparent 55%)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1
              className="text-2xl sm:text-3xl font-black tracking-tight"
              style={{
                background: "linear-gradient(90deg,#7ad8ff,#c46bff,#ff5fb0)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              نمودار حشر
            </h1>
            <p className="text-[11px] text-white/35 font-mono tracking-widest mt-0.5">REALTIME HASHR GRID</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-300/90 bg-emerald-500/10 border border-emerald-400/30 rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              زنده
            </span>
            {currentUser && (
              <button
                onClick={handleLogout}
                className="text-[11px] text-white/40 hover:text-white/70 border border-white/10 rounded-full px-3 py-1.5 transition-colors"
              >
                خروج
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 text-center">
            <div className="text-[10px] text-white/40 font-mono mb-1">میانگین گروه</div>
            <div className="text-2xl font-extrabold font-mono" style={{ color: `hsl(${hueForLevel(avgLevel)},95%,68%)` }}>
              {animatedAvg.toFixed(1)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 text-center">
            <div className="text-[10px] text-white/40 font-mono mb-1">بالاترین حشر</div>
            <div
              className="text-2xl font-extrabold font-mono"
              style={{ color: `hsl(${topHue},95%,68%)`, textShadow: `0 0 14px hsla(${topHue},95%,55%,0.6)` }}
            >
              {topMember ? levels[topMember.id] : "—"}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 text-center">
            <div className="text-[10px] text-white/40 font-mono mb-1">اعضای فعال</div>
            <div className="text-2xl font-extrabold font-mono text-white/85">{MEMBERS.length}</div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-5 sm:p-6 mb-5 relative overflow-hidden">
          <div
            className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-30 pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,95,176,0.35), transparent 70%)" }}
          />
          <div
            className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-25 pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(122,216,255,0.3), transparent 70%)" }}
          />
          <div className="flex items-center justify-between mb-3 relative z-10">
            <span className="text-sm font-bold text-white/85">نمودار زنده سطح حشر اعضا</span>
            <span className="text-[10px] text-white/35 font-mono">۱۰ ← ۱</span>
          </div>
          <div className="relative z-10">
            <LiveChart history={history} members={MEMBERS} levels={levels} />
          </div>
          <div className="flex flex-wrap gap-3 mt-3 relative z-10">
            {MEMBERS.map((m, idx) => (
              <span key={m.id} className="flex items-center gap-1.5 text-[10px] text-white/45">
                <span className="w-2 h-2 rounded-full" style={{ background: `hsl(${HUES[idx % HUES.length]},90%,60%)` }} />
                {m.name}
              </span>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-3">
            {ranking.map((m, idx) => (
              <div key={m.id} className="relative">
                {idx === 0 && (
                  <span className="absolute -top-2.5 -right-2.5 z-10 text-[10px] font-bold rounded-full px-2 py-0.5 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-lg">
                    #۱
                  </span>
                )}
                <MemberCard
                  member={m}
                  level={levels[m.id] ?? 1}
                  isMe={currentUser === m.id}
                  onChangeLevel={handleChangeLevel}
                  justUpdated={justUpdated === m.id}
                />
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <ChaosMeter levels={levels} />
            <ActivityFeed activity={activity} />
          </div>
        </div>

        <footer className="text-center text-white/20 text-[10px] font-mono mt-8 pb-4">HASHR GRID · LIVE SYNC</footer>
      </div>
    </div>
  );
}
