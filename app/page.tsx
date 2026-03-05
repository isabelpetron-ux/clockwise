'use client'

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Moon,
  Sun,
  CalendarDays,
  Sparkles,
  ShieldCheck,
  Info,
  Plus,
  X,
  Timer,
  User,
  ClipboardList,
  CheckCircle2,
  Pencil,
  ArrowRight,
} from "lucide-react";

/**
 * Chronotype-Responsive Campus Design
 * Mock Registrar Platform (single-file React)
 *
 * This version adds:
 * - A dedicated Result page after Intake (so it feels like a “result”)
 * - Mascot + blurb per chronotype (Lion/Bear/Wolf/Dolphin)
 * - Major/Intended Major as a multi-input list + Minor/Intended Minor list
 * - After saving Profile: a completed “Profile Overview” view with Edit
 * - Capitalized nav labels
 */

// -----------------------------
// Mock Data
// -----------------------------

// Catalog seeded from an uploaded Dartmouth timetable export (prototype dataset).
// Each course includes 0+ meeting blocks (some are ARR/Arrange and will have an empty meetings array).
// TODO: replace with generated catalog from timetable PDF
// For now using placeholder so the app compiles.
const COURSES_RAW: any = "+json_str+";

const DAYS = ["M", "T", "W", "Th", "F", "Sa", "Su"];
const GRID_START = 0; // 0:00
const GRID_END = 24; // 24:00

// -----------------------------
// Helpers
// -----------------------------
const STORAGE_KEY = "clockwise:v1";

function safeParseJSON(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function timeToMinutes(t) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function overlapMinutes([a1, a2], [b1, b2]) {
  const s = Math.max(a1, b1);
  const e = Math.min(a2, b2);
  return Math.max(0, e - s);
}

const CHRONOTYPES = {
  Early: {
    label: "Early Type",
    icon: Sun,
    windows: {
      peak: [9 * 60, 12 * 60],
      moderate: [8 * 60, 9 * 60],
      caution: [12 * 60, 15 * 60],
    },
  },
  Intermediate: {
    label: "Intermediate",
    icon: Sparkles,
    windows: {
      peak: [11 * 60, 15 * 60],
      moderate: [9 * 60, 11 * 60],
      caution: [8 * 60, 9 * 60],
    },
  },
  Late: {
    label: "Late Type",
    icon: Moon,
    windows: {
      peak: [12 * 60, 17 * 60],
      moderate: [10 * 60, 12 * 60],
      caution: [8 * 60, 10 * 60],
    },
  },
  Irregular: {
    label: "Irregular / Variable",
    icon: Timer,
    windows: {
      peak: [11 * 60, 14 * 60],
      moderate: [9 * 60, 11 * 60],
      caution: [8 * 60, 9 * 60],
    },
  },
};

const CHRONO_RESULTS = {
  Early: {
    mascot: "🦁",
    mascotName: "Lion (Early Chronotype)",
    

    blurb:
      "You’re a natural early riser. Your brain and body tend to reach peak alertness in the morning and early afternoon, and you may naturally feel ready for sleep earlier in the evening. Morning commitments often feel manageable, while late-night work can quickly drain your energy.",

    peakHours: "8:00 AM – 12:00 PM",
    goodHours: "12:00 PM – 3:00 PM",
    cautionHours: "After 8:00 PM",

    tips: [
      "Prioritize morning or late-morning classes",
      "Use afternoons for collaboration or lighter work",
      "Protect an earlier wind-down routine in the evening",
    ],
  },

  Intermediate: {
    mascot: "🐻",
    mascotName: "Bear (Intermediate Chronotype)",

    blurb:
      "Your circadian rhythm aligns closely with the typical daytime schedule. Most people fall into this category. You tend to feel most productive during late morning and early afternoon, with a gradual dip later in the day.",

    peakHours: "10:00 AM – 2:00 PM",
    goodHours: "9:00 AM – 10:00 AM, 2:00 PM – 4:00 PM",
    cautionHours: "Before 8:00 AM or after 10:00 PM",

    tips: [
      "Anchor your schedule with late-morning or midday classes",
      "Plan demanding work before the mid-afternoon dip",
      "Keep sleep and wake times consistent across the week",
    ],
  },

  Late: {
    mascot: "🐺",
    mascotName: "Wolf (Late Chronotype)",

    blurb:
      "You’re naturally a night owl. Your energy and alertness tend to increase as the day progresses, often peaking in the afternoon or evening. Early morning schedules can feel difficult because your internal clock shifts later than most traditional schedules.",

    peakHours: "3:00 PM – 9:00 PM",
    goodHours: "12:00 PM – 3:00 PM",
    cautionHours: "Before 10:00 AM",

    tips: [
      "Choose midday or afternoon classes whenever possible",
      "Avoid stacking multiple early-morning commitments",
      "Use evenings for deep work or creative tasks",
    ],
  },

  Irregular: {
    mascot: "🐬",
    mascotName: "Dolphin (Irregular Chronotype)",

    blurb:
      "Your sleep and alertness patterns may be more sensitive to disruption. Stress, irregular schedules, or environmental factors can affect your sleep more strongly than other chronotypes. When your routine is consistent, your focus windows—often mid-morning to early afternoon—can be very productive.",

    peakHours: "10:00 AM – 1:00 PM",
    goodHours: "1:00 PM – 4:00 PM",
    cautionHours: "Late nights and highly irregular schedules",

    tips: [
      "Maintain consistent sleep and wake times",
      "Avoid highly irregular commitments or very late nights",
      "Build a reliable wind-down routine to stabilize sleep",
    ],
  },
} as const;

function strainLabel(v) {
  if (v >= 30) return { label: "Aligned", tone: "good" };
  if (v >= -10) return { label: "Mixed", tone: "warn" };
  return { label: "Strain", tone: "bad" };
}

function alignmentContext(score: number, chronotypeKey: string, hasEarlyBlock: boolean) {
  let headline = "";
  let body = "";
  const tips: string[] = [];

  if (score >= 45) {
    headline = "Excellent alignment";
    body =
      "Your schedule lines up very well with your chronotype. Most of your classes and commitments fall during times when you are naturally more alert and productive.";
    tips.push("Maintain consistent sleep and wake times to preserve this alignment.");
    tips.push("If adding a new class, try to keep it in your peak window.");
  } 
  else if (score >= 30) {
    headline = "Good alignment";
    body =
      "Overall your schedule works well with your natural rhythm, though a few blocks may feel slightly effortful.";
    tips.push("If possible, move one commitment closer to your peak window.");
    tips.push("Protect consistent mornings or evenings to keep this alignment strong.");
  } 
  else if (score >= -10) {
    headline = "Mixed alignment";
    body =
      "Parts of your schedule fit your chronotype well, but some commitments fall in times that may feel slower or more draining.";
    tips.push("Try shifting demanding work into your peak window.");
    if (hasEarlyBlock) tips.push("Consider moving the earliest commitment later if possible.");
    tips.push("Avoid stacking multiple early commitments on the same day.");
  } 
  else {
    headline = "High circadian strain";
    body =
      "A significant portion of your schedule falls outside your ideal alertness window. This can lead to fatigue or reduced focus.";
    tips.push("If possible, move your earliest commitment later in the day.");
    tips.push("Cluster demanding classes during your peak energy hours.");
    tips.push("Keep sleep timing consistent to reduce fatigue from misalignment.");
  }

  return { headline, body, tips };
}

function toneBadge(tone) {
  switch (tone) {
    case "good":
      return "bg-emerald-600 text-emerald-950";
    case "warn":
      return "bg-yellow-500 text-black";
    case "bad":
      return "bg-red-600 text-white";
    default:
      return "";
  }
}

function blockStrainMinutes(startMin, endMin, chronotypeKey) {
  const c = CHRONOTYPES[chronotypeKey];
  const block = [startMin, endMin];
  const peak = overlapMinutes(block, c.windows.peak);
  const mod = overlapMinutes(block, c.windows.moderate);
  const caution = overlapMinutes(block, c.windows.caution);
  let score = peak * 1.0 + mod * 0.5 - caution * 1.0;
  const duration = endMin - startMin;
  const norm = duration > 0 ? (score / duration) * 100 : 0;
  return clamp(norm, -100, 100);
}

function courseStrain(course, chronotypeKey) {
  const meetings = course.meetings || [];
  if (!meetings.length) return 0;

  // Time-weighted average across meeting blocks (e.g., lecture + discussion).
  const parts = meetings
    .map((m) => {
      const start = timeToMinutes(m.start);
      const end = timeToMinutes(m.end);
      const minutes = Math.max(0, end - start);
      return { minutes, v: blockStrainMinutes(start, end, chronotypeKey) };
    })
    .filter((p) => p.minutes > 0);

  const total = parts.reduce((a, b) => a + b.minutes, 0);
  const avg = total ? parts.reduce((a, b) => a + b.v * b.minutes, 0) / total : 0;

  // Keep multipliers conservative for timetable-imported courses (we don't have full demand metadata here).
  return clamp(avg, -100, 100);
}

function activityStrain(activity, chronotypeKey) {
  const start = timeToMinutes(activity.start);
  const end = timeToMinutes(activity.end);
  const base = blockStrainMinutes(start, end, chronotypeKey);
  const catMult =
    activity.category === "Varsity Sport" ? 1.15 : activity.category === "Club Sport" ? 1.1 : 1.0;
  return clamp(base * catMult, -100, 100);
}

function emptyActivity() {
  return {
    id: String(Date.now()) + Math.random().toString(16).slice(2),
    category: "Extracurricular",
    name: "",
    days: [],
    start: "18:00",
    end: "19:00",
  };
}

function emptyLine() {
  return { id: String(Date.now()) + Math.random().toString(16).slice(2), value: "" };
}

function formatDays(days) {
  if (!days?.length) return "(no days)";
  return days.join("/");
}
function formatTime12(t: string) {
  if (!t) return "";
  const [hh, mm] = t.split(":").map(Number);

  const period = hh >= 12 ? "PM" : "AM";
  const hour = hh % 12 === 0 ? 12 : hh % 12;

  return `${hour}:${String(mm).padStart(2, "0")} ${period}`;
}

function hourRangeLabel(start, end) {
  return `${start}–${end}`;
}

function formatHour12(hour24: number) {
  const h = ((hour24 + 11) % 12) + 1; // 0->12, 13->1, etc
  const ampm = hour24 < 12 ? "AM" : "PM";
  return `${h}:00 ${ampm}`;
}

function meetingSummary(course) {
  const ms = course.meetings || [];
  if (!ms.length) return "Arrange";
  const first = ms[0];
  const firstDays = (first.days || []).join("/") || "–";
  const firstTime = `${first.start}–${first.end}`;
  const more = ms.length > 1 ? ` +${ms.length - 1}` : "";
  return `${firstDays} • ${firstTime}${more}`;
}

function courseKey(c: any) {
  // Group by "same course" across different sections
  // If your dataset sometimes has title variations, you can remove title from the key.
  return `${c.dept}__${c.number}__${(c.title || "").trim().toLowerCase()}`;
}

function buildCourseLevelRecommendations(
  sectionRecs: any[],
  chronotypeKey: string
) {
  // sectionRecs items should look like:
  // { section: <course-like object>, explanation?: string }
  // OR just be the section object itself (we handle both)

  const groups = new Map<
    string,
    {
      course: any;
      sections: {
        section: any;
        strain: number;
        label: { label: string; tone: string };
        explanation?: string;
      }[];
    }
  >();

  for (const item of sectionRecs || []) {
    const section = item?.section ?? item; // supports either shape
    if (!section) continue;

    const strain = Math.round(courseStrain(section, chronotypeKey));
    const label = strainLabel(strain);

    const k = courseKey(section);
    const existing = groups.get(k);

    const row = {
      section,
      strain,
      label,
      explanation: item?.explanation,
    };

    if (!existing) {
      groups.set(k, { course: section, sections: [row] });
    } else {
      existing.sections.push(row);
    }
  }

  // Sort sections within each course by best strain first
  const courseCards = Array.from(groups.values()).map((g) => {
    g.sections.sort((a, b) => b.strain - a.strain);

    const best = g.sections[0];
    const alternatives = g.sections.slice(1, 3); // show up to 2
    const avoid = g.sections.filter((s) => s.strain < -10).slice(0, 2); // show up to 2

    return {
      course: g.course,
      best,
      alternatives,
      avoid,
    };
  });

  // Sort courses by best strain
  courseCards.sort((a, b) => (b.best?.strain ?? -999) - (a.best?.strain ?? -999));

  return courseCards;
}

function meetingDaysUnion(course) {
  const ms = course.meetings || [];
  const set = new Set();
  for (const m of ms) for (const d of m.days || []) set.add(d);
  return Array.from(set);
}
function parseDaysToken(token: string) {
  const s = token.replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "Tu") { out.push("T"); i++; continue; }
    if (two === "Th") { out.push("Th"); i++; continue; }
    const one = s[i];
    if (one === "M" || one === "T" || one === "W" || one === "F") out.push(one);
  }
  return Array.from(new Set(out));
}

function to24Time(hour: number, minute: number, hint: "morning" | "afternoon" | "unknown") {
  let h = hour;
  if (h === 12) h = 12;
  else if (hint === "afternoon" && h >= 1 && h <= 7) h = h + 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimePair(startH: number, startM: number, endH: number, endM: number) {
  // Heuristics for Dartmouth strings like:
  // "Tu 12:15-1:05" (end is afternoon)
  // "TuTh2:25-4:15" (afternoon)
  // "MWF 8:50-9:55" (morning)
  let hint: "morning" | "afternoon" | "unknown" = "unknown";

  // If start is 12, likely midday -> end is afternoon if it "wraps"
  if (startH === 12) hint = "afternoon";
  // If start is 1–7 and end is also 1–7, most Dartmouth classes at those times are afternoon
  if (startH >= 1 && startH <= 7) hint = "afternoon";
  // If start is 8–11, assume morning
  if (startH >= 8 && startH <= 11) hint = "morning";

  let start = to24Time(startH, startM, hint);

  // End time: if end hour is smaller than start hour (e.g., 12:15–1:05) treat end as afternoon
  let endHint = hint;
  if (endH < startH) endHint = "afternoon";

  let end = to24Time(endH, endM, endHint);

  return { start, end };
}

function parsePeriodRaw(periodRaw: string) {
  if (!periodRaw) return [];
  let s = String(periodRaw).trim();
  if (!s || /^arrange/i.test(s)) return [];

  // Remove leading "10A;" or similar
  s = s.replace(/^\s*\w+;\s*/, "");

  // Split by commas into blocks
  const parts = s.split(",").map(p => p.trim()).filter(Boolean);

  const meetings: any[] = [];

  for (const part of parts) {
    // Match: DAYS + TIME-RANGE, allowing missing space like "TuTh2:25-4:15"
    const m = part.match(/^([A-Za-z]+)\s*(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
    if (!m) continue;

    const dayToken = m[1];
    const days = parseDaysToken(dayToken);
    if (!days.length) continue;

    const startH = Number(m[2]);
    const startM = m[3] ? Number(m[3]) : 0;
    const endH = Number(m[4]);
    const endM = m[5] ? Number(m[5]) : 0;

    const { start, end } = parseTimePair(startH, startM, endH, endM);
    meetings.push({ days, start, end });
  }

  return meetings;
}

// -----------------------------
// Mini schedule grid
// -----------------------------

function Grid({ chronotypeKey, itemsByDay, onRemove }) {
  return (
  <div className="rounded-2xl border border-emerald-900 bg-background">
    {/* Sticky day header row */}
    <div className="grid grid-cols-7 gap-3 px-3 py-2 sticky top-0 z-10 bg-background border-b border-emerald-900">
      {DAYS.map((d) => (
        <div key={`hdr-${d}`} className="text-xs font-medium text-emerald-100/90">
          {d}
        </div>
      ))}
    </div>

    {/* Scrollable week body */}
    <div className="max-h-[75vh] overflow-y-auto">
      <div className="grid grid-cols-7 gap-3 p-3">
        {DAYS.map((d) => (
          <div key={d}>
            <div
              className="relative rounded-2xl border border-emerald-900 bg-background overflow-hidden"
              style={{ height: 900 }}
            >
              {/* time grid lines */}
              {Array.from({ length: GRID_END - GRID_START + 1 }).map((_, i) => {
                const top = (i / (GRID_END - GRID_START)) * 100;
                return (
                  <div key={i} className="absolute left-0 right-0" style={{ top: `${top}%` }}>
                    <div className="border-t border-dashed" />
                    {i < GRID_END - GRID_START ? (
                      <div className="text-[10px] text-muted-foreground px-2 -mt-2">
                        {formatHour12(GRID_START + i)}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {/* events */}
              {(itemsByDay[d] || []).map((item) => {
                const start = timeToMinutes(item.start);
                const end = timeToMinutes(item.end);
                const top =
                  ((start - GRID_START * 60) / ((GRID_END - GRID_START) * 60)) * 100;
                const height = ((end - start) / ((GRID_END - GRID_START) * 60)) * 100;

                const tone =
                  item.kind === "course"
                    ? strainLabel(courseStrain(item.course, chronotypeKey)).tone
                    : strainLabel(activityStrain(item.activity, chronotypeKey)).tone;

                const label =
                  item.kind === "course"
                    ? `${item.course.dept} ${item.course.number}`
                    : item.activity.name || "Activity";

                const sub =
                  item.kind === "course"
                    ? (item.course.meetings?.[0]?.start || "")
                    : item.activity.start;

                return (
                  <div
                    key={item.id}
                    className="absolute left-2 right-2 rounded-2xl border bg-muted p-2"
                    style={{ top: `${top}%`, height: `${height}%` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-semibold leading-tight">{label}</div>
                        <div className="text-[10px] text-muted-foreground leading-tight">
                          {formatTime12(sub)}
                        </div>
                      </div>

                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => onRemove(item)}
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-2">
                      <Badge className={`rounded-full text-[10px] ${toneBadge(tone)}`}>
                        {tone === "good" ? "Aligned" : tone === "warn" ? "Mixed" : "Strain"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
}


// -----------------------------
// App
// -----------------------------

export default function ChronotypeResponsiveRegistrarMock() {
  const [tab, setTab] = useState("intake");

    const navTabs = [
    { key: "intake", label: "Intake" },
    { key: "result", label: "Result" },
    { key: "profile", label: "Profile" },
    { key: "catalog", label: "Catalog" },
    { key: "schedule", label: "Schedule" },
    { key: "summary", label: "Summary" },
  ];

  const [catalogDraft, setCatalogDraft] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogRows, setCatalogRows] = useState<any[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const CATALOG_PAGE_SIZE = 50;
  const [catalogPage, setCatalogPage] = useState(0);
  const [selectedSections, setSelectedSections] = useState<any[]>([]);
  const [aiCourseRecs, setAiCourseRecs] = useState<any[]>([]);
  const [aiCourseLoading, setAiCourseLoading] = useState(false);
  const [aiCourseError, setAiCourseError] = useState<string | null>(null);
  const [aiGeneralRecs, setAiGeneralRecs] = useState<
  { title: string; body: string; priority?: "high" | "medium" | "low" }[]
>([]);
  const [aiGeneralLoading, setAiGeneralLoading] = useState(false);
  const [aiGeneralError, setAiGeneralError] = useState<string | null>(null);
  


  async function applyCatalogSearch(next?: string) {
    const q = (typeof next === "string" ? next : catalogDraft).trim();
    setCatalogQuery(q);
    setCatalogPage(0);

    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const res = await fetch(
        `/api/sections?q=${encodeURIComponent(q)}&limit=50&offset=0`
      );

      const contentType = res.headers.get("content-type") || "";

      // If it’s not JSON, read text so we can show what's actually coming back
      if (!res.ok || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          `API error (${res.status}). Expected JSON but got: ${text.slice(0, 180)}`
        );
      }

      const data = await res.json();
      setCatalogRows((data.rows || []).map(rowToCourse));
      setCatalogTotal(data.total || 0);
    } catch (e: any) {
      setCatalogError(e?.message || "Search failed");
      setCatalogRows([]);
      setCatalogTotal(0);
    } finally {
      setCatalogLoading(false);
    }
}

async function runAiScheduleSupport() {
  console.log("RUN AI SCHEDULE SUPPORT CLICKED");

  setAiGeneralLoading(true);
  setAiGeneralError(null);

  try {
    const payload = {
      mode: "general",
      chronotypeKey,
      profile,
      alignment: {
        score: overallMetrics.combined,
        label: overallLabel.label,
        headline: alignmentInfo.headline,
        hasEarlyBlock,
        diagnostics: alignmentDiagnostics?.bullets || [],
        highStrainCourses: overallMetrics.highStrainCourses,
        highStrainActs: overallMetrics.highStrainActs,
      },
    };

    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    console.log("SCHEDULE SUPPORT STATUS", res.status);
    console.log("SCHEDULE SUPPORT RAW", raw.slice(0, 800));

    if (!res.ok) throw new Error(raw || `API error (${res.status})`);

    const data = raw ? JSON.parse(raw) : {};
    console.log("SCHEDULE SUPPORT PARSED", data);

    setAiGeneralRecs(
      Array.isArray(data.generalRecommendations) ? data.generalRecommendations : []
    );
  } catch (e: any) {
    console.error("AI schedule support failed", e);
    setAiGeneralError(e?.message || "AI schedule support failed");
    setAiGeneralRecs([]);
  } finally {
    setAiGeneralLoading(false);
  }
}


async function runAiCourseRecommend() {
  setAiCourseLoading(true);
  setAiCourseError(null);

  try {
    const candidateSections = (catalogRows || [])
      .filter((c) => !selectedSections.some((s) => s.id === c.id))
      .slice(0, 120);

    if (!candidateSections.length) {
      throw new Error("Run a Catalog search first (e.g., ECON) so I have candidates.");
    }

    const payload = {
      mode: "courses",
      chronotypeKey,
      profile,
      alignment: {
        score: overallMetrics.combined,
        diagnostics: alignmentDiagnostics?.bullets || [],
      },
      candidates: candidateSections,
      selectedSections,
    };

    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(raw || `API error (${res.status})`);

    const data = raw ? JSON.parse(raw) : {};
    const sectionRecs = Array.isArray(data.courseRecommendations) ? data.courseRecommendations : [];

    const courseCards = buildCourseLevelRecommendations(sectionRecs, chronotypeKey);
    setAiCourseRecs(courseCards);
  } catch (e: any) {
    setAiCourseError(e?.message || "AI course recommend failed");
    setAiCourseRecs([]);
  } finally {
    setAiCourseLoading(false);
  }
}

  function rowToCourse(row: any) {
  return {
    id: row.id,
    dept: row.subj,
    number: String(row.num).replace(/\.0$/, ""),
    title: row.title,
    instructor: row.instructor || "TBD",
    dist: row.dist || "",
    periodCode: row.period_code || "",
    periodRaw: row.period_raw || "",
    meetings: parsePeriodRaw(row.period_raw || ""),
    demand: "TBD",
    sensitivity: "TBD",
    modality: "TBD",
    distrib: [],
  };
} 
  const allCourses = useMemo(() => {
    // Support either a baked-in array OR a JSON string.
    if (Array.isArray(COURSES_RAW)) return COURSES_RAW;
    if (typeof COURSES_RAW === "string") {
      const s = COURSES_RAW.trim();
      if (!s) return [];
      try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, []);

  const filteredCourses = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return allCourses;
    return allCourses.filter((c: any) => {
      const dept = String(c.dept || "").toLowerCase();
      const num = String(c.number || "").toLowerCase();
      const title = String(c.title || "").toLowerCase();
      const id = String(c.id || "").toLowerCase();
      return (
        dept.includes(q) ||
        num.includes(q) ||
        id.includes(q) ||
        title.includes(q) ||
        `${dept} ${num}`.includes(q)
      );
    });
  }, [allCourses, catalogQuery]);

  const [showConfetti, setShowConfetti] = useState(false);
  const confettiKeyRef = useRef(0);
  const autoAdvancedRef = useRef(false);
  const [chronotypeKey, setChronotypeKey] = useState("Intermediate");
  const [selectedIds, setSelectedIds] = useState([]);

  // Profile state
  const [profile, setProfile] = useState({
    name: "",
    majors: [emptyLine()],
    minors: [emptyLine()],
    activities: [emptyActivity()],
  });
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [profileMode, setProfileMode] = useState("edit"); // 'edit' | 'view'

    const [intakeAnswers, setIntakeAnswers] = useState({});


  // -----------------------------
// Load saved state on first render
// -----------------------------
useEffect(() => {
  const saved = safeParseJSON(localStorage.getItem(STORAGE_KEY));
  if (!saved) return;

  if (saved.profile) setProfile(saved.profile);
  if (typeof saved.profileCompleted === "boolean") setProfileCompleted(saved.profileCompleted);
  if (saved.profileMode) setProfileMode(saved.profileMode);
  if (saved.chronotypeKey) setChronotypeKey(saved.chronotypeKey);
  if (Array.isArray(saved.selectedSections)) setSelectedSections(saved.selectedSections);
  if (saved.intakeAnswers) setIntakeAnswers(saved.intakeAnswers);
}, []);

// -----------------------------
// Save state whenever it changes
// -----------------------------
useEffect(() => {
  const state = {
    profile,
    profileCompleted,
    profileMode,
    chronotypeKey,
    selectedSections,
    intakeAnswers,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / privacy mode errors
  }
}, [profile, profileCompleted, profileMode, chronotypeKey, selectedSections, intakeAnswers]);

  // --- Intake survey (prototype) ---
  const intakeQuestions = useMemo(
    () => [
      {
        id: "sleep_fall",
        title: "On days with no obligations, what time do you naturally fall asleep?",
        options: [
          { label: "Before 10:30 PM", score: -2 },
          { label: "10:30 PM – 12:00 AM", score: -1 },
          { label: "12:00 AM – 1:30 AM", score: 1 },
          { label: "After 1:30 AM", score: 2 },
        ],
      },
      {
        id: "sleep_wake",
        title: "On those same days, what time do you wake up naturally?",
        options: [
          { label: "Before 7:00 AM", score: -2 },
          { label: "7:00 – 8:30 AM", score: -1 },
          { label: "8:30 – 10:00 AM", score: 1 },
          { label: "After 10:00 AM", score: 2 },
        ],
      },
      {
        id: "sharpest",
        title: "When do you feel mentally sharpest?",
        options: [
          { label: "Early morning (7–10 AM)", score: -2 },
          { label: "Late morning (10–12)", score: -1 },
          { label: "Afternoon (12–4)", score: 1 },
          { label: "Evening (6–10)", score: 2 },
        ],
      },
      {
        id: "wake_difficulty",
        title: "How hard is it for you to wake up before 8:30 AM?",
        options: [
          { label: "Not hard at all", score: -2 },
          { label: "Slightly hard", score: -1 },
          { label: "Very difficult", score: 1 },
          { label: "Nearly impossible without alarm", score: 2 },
        ],
      },
      {
        id: "variability",
        title: "How consistent is your sleep schedule week-to-week?",
        options: [
          { label: "Very consistent", score: 0 },
          { label: "Somewhat consistent", score: 1 },
          { label: "It changes a lot", score: 2 },
          { label: "Extremely variable", score: 3 },
        ],
      },
    ],
    []
  );


  const computedChronotype = useMemo(() => {
    const variability = intakeAnswers.variability ?? 0;
    if (variability >= 3) return "Irregular";

    let total = 0;
    for (const q of intakeQuestions) {
      const v = intakeAnswers[q.id];
      if (typeof v === "number") total += v;
    }

    if (total <= -4) return "Early";
    if (total >= 4) return "Late";
    return "Intermediate";
  }, [intakeAnswers, intakeQuestions]);

  const intakeAnsweredCount = useMemo(
    () => intakeQuestions.filter((q) => intakeAnswers[q.id] !== undefined).length,
    [intakeQuestions, intakeAnswers]
  );

  const intakeProgress = useMemo(
    () => Math.round((intakeAnsweredCount / intakeQuestions.length) * 100),
    [intakeAnsweredCount, intakeQuestions.length]
  );

  // Auto-advance to Result once the intake is 100% complete.
  useEffect(() => {
    const complete = intakeAnsweredCount === intakeQuestions.length;

    // If the user leaves Intake and comes back, allow auto-advance again.
    if (tab !== "intake") {
      autoAdvancedRef.current = false;
      return;
    }

    if (complete && !autoAdvancedRef.current) {
      autoAdvancedRef.current = true;

      // Apply result + celebration, then route to Result.
      setChronotypeKey(computedChronotype);
      confettiKeyRef.current += 1;
      setShowConfetti(true);
      setTab("result");
      window.setTimeout(() => setShowConfetti(false), 1600);
    }
  }, [tab, intakeAnsweredCount, intakeQuestions.length, computedChronotype]);

      const selectedCourses = useMemo(() => selectedSections, [selectedSections]);

  // Expand courses into day items for schedule grid
  const scheduleCourseItems = useMemo(() => {
    const items = [];
    for (const c of selectedCourses) {
      const meetings = c.meetings || [];
      for (const m of meetings) {
        for (const d of m.days || []) {
          items.push({
            id: `course-${c.id}-${d}-${m.start}-${m.end}`,
            kind: "course",
            day: d,
            start: m.start,
            end: m.end,
            course: c,
          });
        }
      }
    }
    return items;
  }, [selectedCourses]);

  const scheduleActivityItems = useMemo(() => {
    const items = [];
    for (const a of profile.activities || []) {
      if (!a.name || !a.days?.length) continue;
      for (const d of a.days) {
        items.push({
          id: `act-${a.id}-${d}`,
          kind: "activity",
          day: d,
          start: a.start,
          end: a.end,
          activity: a,
        });
      }
    }
    return items;
  }, [profile.activities]);

  const itemsByDay = useMemo(() => {
    const map = { M: [], T: [], W: [], Th: [], F: [], Sa: [], Su: [] };

    for (const it of [...scheduleCourseItems, ...scheduleActivityItems]) {
      map[it.day].push(it);
    }

    for (const d of DAYS) {
      map[d].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    }

    return map;
  }, [scheduleCourseItems, scheduleActivityItems]);

  // Alignment scoring: combine course + activity strain weighted by time.
  const overallMetrics = useMemo(() => {
    const courseBlocks = scheduleCourseItems;
    const actBlocks = scheduleActivityItems;

    const courseScores = courseBlocks.map((b) => {
      const start = timeToMinutes(b.start);
      const end = timeToMinutes(b.end);
      const minutes = Math.max(0, end - start);
      return { minutes, score: courseStrain(b.course, chronotypeKey) };
    });

    const actScores = actBlocks.map((b) => {
      const start = timeToMinutes(b.start);
      const end = timeToMinutes(b.end);
      const minutes = Math.max(0, end - start);
      return { minutes, score: activityStrain(b.activity, chronotypeKey) };
    });

    const totalCourseMin = courseScores.reduce((a, b) => a + b.minutes, 0);
    const totalActMin = actScores.reduce((a, b) => a + b.minutes, 0);

    const courseWeighted = totalCourseMin
      ? courseScores.reduce((a, b) => a + b.score * b.minutes, 0) / totalCourseMin
      : 0;

    const actWeighted = totalActMin
      ? actScores.reduce((a, b) => a + b.score * b.minutes, 0) / totalActMin
      : 0;

    const combined =
      totalCourseMin + totalActMin > 0 ? courseWeighted * 0.65 + actWeighted * 0.35 : 0;

    const highStrainCourses = selectedCourses.filter((c) => courseStrain(c, chronotypeKey) < -35).length;
    const highStrainActs = (profile.activities || []).filter(
      (a) => a.name && a.days?.length && activityStrain(a, chronotypeKey) < -35
    ).length;

    return {
      courseWeighted,
      actWeighted,
      combined,
      totalCourseMin,
      totalActMin,
      highStrainCourses,
      highStrainActs,
    };
  }, [scheduleCourseItems, scheduleActivityItems, selectedCourses, profile.activities, chronotypeKey]);

  const overallLabel = strainLabel(overallMetrics.combined);

  const alignmentDiagnostics = useMemo(() => {
    return diagnoseAlignment(scheduleCourseItems, scheduleActivityItems, chronotypeKey);
  }, [scheduleCourseItems, scheduleActivityItems, chronotypeKey]);

  const hasEarlyBlock = useMemo(() => {
  return [...scheduleCourseItems, ...scheduleActivityItems].some(
    (b) => timeToMinutes(b.start) < 10 * 60
  );
}, [scheduleCourseItems, scheduleActivityItems]);

const alignmentInfo = alignmentContext(
  overallMetrics.combined,
  chronotypeKey,
  hasEarlyBlock
);
function classifyBlock(startMin: number, endMin: number, chronotypeKey: string) {
  const c = CHRONOTYPES[chronotypeKey];
  const block: [number, number] = [startMin, endMin];

  const peak = overlapMinutes(block, c.windows.peak);
  const moderate = overlapMinutes(block, c.windows.moderate);
  const caution = overlapMinutes(block, c.windows.caution);

  // Pick the label with the most overlap
  const max = Math.max(peak, moderate, caution);
  if (max === 0) return "outside";
  if (max === peak) return "peak";
  if (max === moderate) return "moderate";
  return "caution";
}

function diagnoseAlignment(
  scheduleCourseItems: any[],
  scheduleActivityItems: any[],
  chronotypeKey: string
) {
  const blocks = [...scheduleCourseItems, ...scheduleActivityItems].map((b) => {
    const startMin = timeToMinutes(b.start);
    const endMin = timeToMinutes(b.end);
    const kind = b.kind;
    const day = b.day;
    const label = classifyBlock(startMin, endMin, chronotypeKey);
    return { ...b, startMin, endMin, kind, day, label };
  });

  if (!blocks.length) {
    return {
      headline: "No schedule blocks yet",
      bullets: ["Add courses and/or commitments to see diagnostics."],
    };
  }

  // Counts
  const cautionBlocks = blocks.filter((b) => b.label === "caution");
  const peakBlocks = blocks.filter((b) => b.label === "peak");
  const earlyBlocks = blocks.filter((b) => b.startMin < 10 * 60); // before 10am
  const lateBlocks = blocks.filter((b) => b.startMin >= 18 * 60); // 6pm+

  // Day clustering: count days with 2+ caution/early blocks
  const byDay = new Map<string, { caution: number; early: number }>();
  for (const b of blocks) {
    const cur = byDay.get(b.day) || { caution: 0, early: 0 };
    if (b.label === "caution") cur.caution += 1;
    if (b.startMin < 10 * 60) cur.early += 1;
    byDay.set(b.day, cur);
  }
  const stackedDays = Array.from(byDay.entries()).filter(
    ([, v]) => v.caution >= 2 || v.early >= 2
  );

  // Consistency: earliest start time per day, measure spread
  const earliestByDay = new Map<string, number>();
  for (const b of blocks) {
    const prev = earliestByDay.get(b.day);
    if (prev === undefined || b.startMin < prev) earliestByDay.set(b.day, b.startMin);
  }
  const earliestStarts = Array.from(earliestByDay.values());
  const spread =
    earliestStarts.length >= 2
      ? Math.max(...earliestStarts) - Math.min(...earliestStarts)
      : 0;

  // Build bullet list (tailored)
  const bullets: string[] = [];

  // Caution window
  if (cautionBlocks.length >= 3) {
    bullets.push(
      `You have ${cautionBlocks.length} blocks landing in your chronotype “caution” window (more effortful time).`
    );
  } else if (cautionBlocks.length >= 1) {
    bullets.push(
      `A few blocks (${cautionBlocks.length}) land in your chronotype “caution” window.`
    );
  }

  // Chronotype-specific early/late sensitivity
  if (chronotypeKey === "Late" && earlyBlocks.length >= 1) {
    bullets.push(
      `Early commitments: ${earlyBlocks.length} blocks start before 10:00 AM (tougher for Late/Wolf types).`
    );
  }
  if (chronotypeKey === "Early" && lateBlocks.length >= 2) {
    bullets.push(
      `Late commitments: ${lateBlocks.length} blocks start after 6:00 PM (can push bedtime later for Early/Lion types).`
    );
  }

  // Stacking
  if (stackedDays.length >= 1) {
    const days = stackedDays.map(([d]) => d).join(", ");
    bullets.push(
      `Stacked strain: ${stackedDays.length} day(s) have multiple early/caution blocks (especially ${days}).`
    );
  }

  // Inconsistency
  if (spread >= 180) {
    bullets.push(
      `Your earliest start times vary by about ${Math.round(spread / 60)} hours across the week (can feel like “social jet lag”).`
    );
  } else if (spread >= 120) {
    bullets.push(
      `Your earliest start times vary by about ${Math.round(spread / 60)} hours across the week (mild inconsistency).`
    );
  }

  // Positive note if not much to flag
  if (!bullets.length) {
    bullets.push(
      "No major red flags detected — most of your schedule sits in moderate/peak windows."
    );
  }

  // A quick “headline”
  const headline =
    cautionBlocks.length >= 4 || stackedDays.length >= 2 || (chronotypeKey === "Late" && earlyBlocks.length >= 2)
      ? "Primary friction points detected"
      : "Minor friction points";

  return { headline, bullets, stats: { peak: peakBlocks.length, caution: cautionBlocks.length } };
}

  function removeFromSchedule(item) {
  if (item.kind === "course") {
    setSelectedSections((prev) => prev.filter((c) => c.id !== item.course.id));
  } else {
    setProfile((p) => ({
      ...p,
      activities: (p.activities || []).filter((a) => a.id !== item.activity.id),
    }));
  }
}

  function goToResult() {
    // Apply chronotype immediately, then show a dedicated Result page.
    setChronotypeKey(computedChronotype);
    confettiKeyRef.current += 1;
    setShowConfetti(true);
    setTab("result");
    window.setTimeout(() => setShowConfetti(false), 1600);
  }

  function continueFromResult() {
    setTab("profile");
  }

  function markProfileComplete() {
    setProfileCompleted(true);
    setProfileMode("view");
    setTab("profile");
  }

  const recommendations = useMemo(() => {
    const lifestyle = [];

    lifestyle.push({
      title: "Anchor a consistent wake time",
      body:
        "Pick a wake time you can keep within ~60 minutes across weekdays/weekends. Consistency is the fastest way to stabilize circadian rhythm during the term.",
    });

    lifestyle.push({
      title: "Use light strategically (especially in winter)",
      body:
        "Get bright outdoor light within 30–60 minutes of waking; dim lights and avoid bright screens in the last hour before sleep. Light is your strongest ‘reset’ lever.",
    });

    const hasEarlyBlock = [...scheduleCourseItems, ...scheduleActivityItems].some(
      (b) => timeToMinutes(b.start) < 10 * 60
    );

    if (chronotypeKey === "Late") {
      lifestyle.push({
        title: "If you need earlier mornings, shift gradually",
        body:
          "Move wake time earlier by 15–20 minutes every 2–3 days (not all at once). Pair the earlier wake with morning light to actually move your body clock.",
      });
    }

    if (chronotypeKey === "Irregular") {
      lifestyle.push({
        title: "Reduce ‘social jet lag’ first",
        body:
          "Your biggest win is narrowing the gap between weekday and weekend sleep. Keep weekend wake time within ~90 minutes of weekdays.",
      });
    }

    if (hasEarlyBlock) {
      lifestyle.push({
        title: "Support early commitments with an evening boundary",
        body:
          "If you have early classes/rehearsals/practices, set a realistic ‘wind-down start’ time. The goal isn’t perfection—it’s protecting enough sleep opportunity to match the schedule you built.",
      });
      lifestyle.push({
        title: "Caffeine with a cutoff",
        body:
          "Use caffeine to support the schedule you have: take it earlier, and set a cutoff (often mid-afternoon) so it doesn’t push sleep later.",
      });
    }

    lifestyle.push({
      title: "A 10-minute ‘downshift’ ritual",
      body:
        "Keep it simple: warm shower, low light, a short stretch, or reading. Repeating the same cue nightly trains faster sleep onset.",
    });

    return { lifestyle };
  }, [chronotypeKey, scheduleCourseItems, scheduleActivityItems]);

  // -----------------------------
  // UI
  // -----------------------------



  const chronoInfo = CHRONO_RESULTS[chronotypeKey];
  const ChronoIcon = CHRONOTYPES[chronotypeKey].icon;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-emerald-950/40 to-background">
      {/* Confetti + celebratory pop (no external libs) */}
      <style jsx global>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes result-pop {
          0% { transform: scale(0.98); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {showConfetti ? (
        <div
          key={confettiKeyRef.current}
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
        >
          {Array.from({ length: 70 }).map((_, i) => {
            const left = Math.random() * 100;
            const delay = Math.random() * 0.35;
            const duration = 1.1 + Math.random() * 0.9;
            const size = 6 + Math.random() * 6;
            const shape = Math.random() > 0.6 ? "rounded-full" : "rounded-sm";
            const colors = [
              "bg-emerald-400",
              "bg-emerald-500",
              "bg-emerald-300",
              "bg-yellow-400",
              "bg-white",
            ];
            const color = colors[Math.floor(Math.random() * colors.length)];
            return (
              <div
                key={i}
                className={`absolute top-0 ${shape} ${color} opacity-90 shadow-sm`}
                style={{
                  left: `${left}%`,
                  width: `${size}px`,
                  height: `${size * (Math.random() > 0.5 ? 1.6 : 1)}px`,
                  animation: `confetti-fall ${duration}s ease-out ${delay}s forwards`,
                }}
              />
            );
          })}
        </div>
      ) : null}

      <div className="sticky top-0 z-20 backdrop-blur bg-emerald-950/80 border-b border-emerald-900">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-emerald-50">
            <CalendarDays className="h-5 w-5" />
            <span className="font-semibold">ClockWise</span>
            <Badge
              variant="outline"
              className="ml-2 rounded-full border-emerald-700 text-emerald-50 hidden md:inline-flex"
            >
              {CHRONOTYPES[chronotypeKey].label}
            </Badge>
          </div>

         <div className="flex gap-2 flex-wrap justify-end">
          {navTabs.map((t) => (
            <Button
              key={t.key}
              variant={tab === t.key ? "default" : "outline"}
              className={
                tab === t.key
                  ? "rounded-2xl bg-emerald-600 text-emerald-950 hover:bg-emerald-500"
                  : "rounded-2xl bg-white text-black"
              }
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* INTAKE */}
        {tab === "intake" && (
          <div className="space-y-4">
            <Card className="rounded-2xl border-emerald-900">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xl font-semibold">Chronotype Intake</div>
                    <div className="text-sm text-muted-foreground">
                      Answer a few questions to estimate your chronotype.
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Completion</div>
                    <div className="mt-2">
                      <Progress value={intakeProgress} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full bg-emerald-600 text-emerald-950">
                    Live estimate: {CHRONOTYPES[computedChronotype].label}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-emerald-700 text-emerald-50">
                    {intakeAnsweredCount}/{intakeQuestions.length} answered
                  </Badge>
                </div>

                <div className="text-sm text-muted-foreground">
                  (Prototype note: advisory only — designed for planning, not diagnosis.)
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    className="rounded-2xl bg-emerald-600 text-emerald-950 hover:bg-emerald-500"
                    onClick={goToResult}
                    disabled={intakeAnsweredCount === 0}
                  >
                    View my result
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl bg-white text-black"
                    onClick={() => {
                      setIntakeAnswers({});
                      setProfileCompleted(false);
                      setProfileMode("edit");
                      setTab("intake");
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              {intakeQuestions.map((q) => (
                <Card key={q.id} className="rounded-2xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{q.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {q.options.map((opt) => {
                      const selected = intakeAnswers[q.id] === opt.score;
                      return (
                        <button
                          key={opt.label}
                          onClick={() => setIntakeAnswers((s) => ({ ...s, [q.id]: opt.score }))}
                          className={`w-full text-left px-3 py-2 rounded-2xl border transition ${
                            selected
                              ? "bg-emerald-600 text-emerald-950 border-transparent"
                              : "hover:bg-muted"
                          }`}
                        >
                          <div className="text-sm">{opt.label}</div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* RESULT */}
        {tab === "result" && (
          <div className="space-y-4" style={{ animation: "result-pop 220ms ease-out" }}>
            <Card className="rounded-2xl border-emerald-900">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xl font-semibold">Your Chronotype Result</div>
                    <div className="text-sm text-muted-foreground">
                      Based on your intake responses, here’s your recommended chronotype.
                    </div>
                  </div>
                  <Badge className="rounded-full bg-emerald-600 text-emerald-950">Applied</Badge>
                </div>

                <div className="grid md:grid-cols-3 gap-4 items-stretch">
                  <Card className="rounded-2xl border-emerald-900 md:col-span-1">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Mascot</div>
                        <ChronoIcon className="h-4 w-4 text-emerald-50" />
                      </div>
                      <div className="text-6xl leading-none">{chronoInfo.mascot}</div>
                      <div className="text-sm text-muted-foreground">
                        {chronoInfo.mascotName}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-emerald-900 md:col-span-2">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="rounded-full bg-emerald-600 text-emerald-950">
                          {CHRONOTYPES[chronotypeKey].label}
                        </Badge>
                        <Badge variant="outline" className="rounded-full border-emerald-700 text-emerald-50">
                          Prototype result
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">{chronoInfo.blurb}</div>
                      <div className="grid md:grid-cols-3 gap-3 pt-2">
                      <div className="rounded-xl border border-emerald-900 p-3">
                        <div className="text-xs text-muted-foreground">Peak hours</div>
                        <div className="text-sm font-semibold">{chronoInfo.peakHours}</div>
                      </div>

                      <div className="rounded-xl border border-emerald-900 p-3">
                        <div className="text-xs text-muted-foreground">Good hours</div>
                        <div className="text-sm font-semibold">{chronoInfo.goodHours}</div>
                      </div>

                      <div className="rounded-xl border border-emerald-900 p-3">
                        <div className="text-xs text-muted-foreground">High-strain hours</div>
                        <div className="text-sm font-semibold">{chronoInfo.cautionHours}</div>
                      </div>
                    </div>
                      <div className="flex flex-wrap gap-2">
                        {chronoInfo.tips.map((t) => (
                          <Badge key={t} variant="outline" className="rounded-full border-emerald-700 text-emerald-50">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    className="rounded-2xl bg-emerald-600 text-emerald-950 hover:bg-emerald-500"
                    onClick={continueFromResult}
                  >
                    Create my profile
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl bg-white text-black"
                    onClick={() => setTab("intake")}
                  >
                    Back to intake
                  </Button>
                </div>

                <div className="pt-2 text-xs text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Advisory-only prototype. The goal is planning alignment—not labeling you permanently.
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* PROFILE */}
        {tab === "profile" && (
          <div className="space-y-4">
            <Card className="rounded-2xl border-emerald-900">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      <div className="text-xl font-semibold">Student Profile</div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Add your major + weekly commitments. These will appear in the Schedule tab and count toward your alignment score.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-full border-emerald-700 text-emerald-50">
                      {profileCompleted ? "Profile saved" : "Profile not saved"}
                    </Badge>
                    {profileCompleted ? (
                      <Badge className="rounded-full bg-emerald-600 text-emerald-950">Complete</Badge>
                    ) : null}
                  </div>
                </div>

                {/* Completed Profile View */}
                {profileCompleted && profileMode === "view" ? (
                  <div className="space-y-4">
                    <Card className="rounded-2xl border-emerald-900">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5" />
                            <div className="text-lg font-semibold">Profile Overview</div>
                          </div>
                          <Button
                            variant="outline"
                            className="rounded-2xl bg-white text-black"
                            onClick={() => setProfileMode("edit")}
                          >
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </Button>
                        </div>

                        <div className="grid md:grid-cols-3 gap-3">
                          <div className="rounded-2xl border border-emerald-900 p-4">
                            <div className="text-xs text-muted-foreground">Name</div>
                            <div className="text-sm font-semibold mt-1">{profile.name || "—"}</div>
                          </div>
                          <div className="rounded-2xl border border-emerald-900 p-4">
                            <div className="text-xs text-muted-foreground">Major / Intended Major</div>
                            <div className="text-sm font-semibold mt-1">
                              {(profile.majors || []).map((m) => m.value).filter(Boolean).join(", ") || "—"}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-emerald-900 p-4">
                            <div className="text-xs text-muted-foreground">Minor / Intended Minor</div>
                            <div className="text-sm font-semibold mt-1">
                              {(profile.minors || []).map((m) => m.value).filter(Boolean).join(", ") || "—"}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-emerald-900 p-4">
                          <div className="text-xs text-muted-foreground">Weekly commitments</div>
                          <div className="text-sm font-semibold mt-1">
                            {(profile.activities || []).filter((a) => a.name && a.days?.length).length} commitments saved
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            These will be overlaid in your Schedule and included in alignment.
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="rounded-2xl bg-emerald-600 text-emerald-950 hover:bg-emerald-500"
                            onClick={() => setTab("schedule")}
                          >
                            Go to schedule
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-2xl bg-white text-black"
                            onClick={() => setTab("catalog")}
                          >
                            Browse catalog
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  /* Edit Profile View */
                  <>
                    <div className="space-y-5">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Name (optional)</div>
                        <Input
                          value={profile.name}
                          onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Sam"
                          className="rounded-2xl"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">Major / Intended Major</div>
                          <Button
                            variant="outline"
                            className="rounded-2xl bg-white text-black"
                            onClick={() =>
                              setProfile((p) => ({
                                ...p,
                                majors: [...(p.majors || []), emptyLine()],
                              }))
                            }
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {(profile.majors || []).map((m) => (
                            <div key={m.id} className="flex gap-2">
                              <Input
                                value={m.value}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setProfile((p) => ({
                                    ...p,
                                    majors: (p.majors || []).map((x) =>
                                      x.id === m.id ? { ...x, value: val } : x
                                    ),
                                  }));
                                }}
                                placeholder="e.g., Computer Science"
                                className="rounded-2xl"
                              />
                              <Button
                                variant="outline"
                                className="rounded-2xl bg-white text-black"
                                onClick={() =>
                                  setProfile((p) => ({
                                    ...p,
                                    majors: (p.majors || []).filter((x) => x.id !== m.id),
                                  }))
                                }
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">Minor / Intended Minor</div>
                          <Button
                            variant="outline"
                            className="rounded-2xl bg-white text-black"
                            onClick={() =>
                              setProfile((p) => ({
                                ...p,
                                minors: [...(p.minors || []), emptyLine()],
                              }))
                            }
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {(profile.minors || []).map((m) => (
                            <div key={m.id} className="flex gap-2">
                              <Input
                                value={m.value}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setProfile((p) => ({
                                    ...p,
                                    minors: (p.minors || []).map((x) =>
                                      x.id === m.id ? { ...x, value: val } : x
                                    ),
                                  }));
                                }}
                                placeholder="e.g., Anthropology"
                                className="rounded-2xl"
                              />
                              <Button
                                variant="outline"
                                className="rounded-2xl bg-white text-black"
                                onClick={() =>
                                  setProfile((p) => ({
                                    ...p,
                                    minors: (p.minors || []).filter((x) => x.id !== m.id),
                                  }))
                                }
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Weekly commitments</div>
                          <div className="text-xs text-muted-foreground">
                            A cappella, student government, dance, sports, hobbies, work, etc.
                          </div>
                        </div>
                        <Button
                          className="rounded-2xl bg-white text-black border border-emerald-700 hover:bg-emerald-100"
                          variant="outline"
                          onClick={() =>
                            setProfile((p) => ({ ...p, activities: [...(p.activities || []), emptyActivity()] }))
                          }
                        >
                          <Plus className="h-4 w-4 mr-2" /> Add activity
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {(profile.activities || []).map((a, idx) => (
                          <Card key={a.id} className="rounded-2xl">
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-semibold">Activity {idx + 1}</div>
                                <Button
                                  variant="outline"
                                  className="rounded-2xl bg-white text-black"
                                  onClick={() =>
                                    setProfile((p) => ({
                                      ...p,
                                      activities: (p.activities || []).filter((x) => x.id !== a.id),
                                    }))
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="grid md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground">Category</div>
                                  <select
                                    value={a.category}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setProfile((p) => ({
                                        ...p,
                                        activities: (p.activities || []).map((x) =>
                                          x.id === a.id ? { ...x, category: val } : x
                                        ),
                                      }));
                                    }}
                                    className="w-full rounded-2xl border px-3 py-2 text-sm bg-background"
                                  >
                                    <option>Extracurricular</option>
                                    <option>Student Government</option>
                                    <option>A Cappella</option>
                                    <option>Dance</option>
                                    <option>Club Sport</option>
                                    <option>Varsity Sport</option>
                                    <option>Hobby</option>
                                    <option>Work</option>
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground">Name</div>
                                  <Input
                                    value={a.name}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setProfile((p) => ({
                                        ...p,
                                        activities: (p.activities || []).map((x) =>
                                          x.id === a.id ? { ...x, name: val } : x
                                        ),
                                      }));
                                    }}
                                    placeholder="e.g., Dodecaphonics rehearsal"
                                    className="rounded-2xl"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground">Days</div>
                                  <div className="flex flex-wrap gap-2">
                                    {DAYS.map((d) => {
                                      const checked = a.days.includes(d);
                                      return (
                                        <label key={d} className="flex items-center gap-2 text-sm">
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={(v) => {
                                              const next = Boolean(v)
                                                ? Array.from(new Set([...a.days, d]))
                                                : a.days.filter((x) => x !== d);
                                              setProfile((p) => ({
                                                ...p,
                                                activities: (p.activities || []).map((x) =>
                                                  x.id === a.id ? { ...x, days: next } : x
                                                ),
                                              }));
                                            }}
                                          />
                                          {d}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                              <div className="grid md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground">Start</div>
                                  <Input
                                    type="time"
                                    value={a.start}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setProfile((p) => ({
                                        ...p,
                                        activities: (p.activities || []).map((x) =>
                                          x.id === a.id ? { ...x, start: val } : x
                                        ),
                                      }));
                                    }}
                                    className="rounded-2xl"
                                  />
                                  <div className="text-[11px] text-muted-foreground">
                                    Use 12-hour time (e.g., 07:30 AM, 10:15 PM)
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground">End</div>
                                  <Input
                                    type="time"
                                    value={a.end}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setProfile((p) => ({
                                        ...p,
                                        activities: (p.activities || []).map((x) =>
                                          x.id === a.id ? { ...x, end: val } : x
                                        ),
                                      }));
                                    }}
                                    className="rounded-2xl"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground">Alignment</div>
                                  <div className="flex items-center gap-2 h-10">
                                    {a.name && a.days?.length ? (
                                      <>
                                        <Badge
                                          className={`rounded-full ${toneBadge(
                                            strainLabel(activityStrain(a, chronotypeKey)).tone
                                          )}`}
                                        >
                                          {strainLabel(activityStrain(a, chronotypeKey)).label}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {formatDays(a.days)} • {hourRangeLabel(a.start, a.end)}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">Add days + time</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        className="rounded-2xl bg-emerald-600 text-emerald-950 hover:bg-emerald-500"
                        onClick={markProfileComplete}
                      >
                        Save profile
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-2xl bg-white text-black"
                        onClick={() => {
                          setProfileCompleted(false);
                          setProfileMode("edit");
                          setTab("result");
                        }}
                      >
                        Back to result
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

{/* CATALOG */}
{tab === "catalog" && (
  <div className="space-y-4">
    <Card className="rounded-2xl border-emerald-900">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Search the catalog</div>
            <div className="text-xs text-muted-foreground">
              Search by department (e.g., ECON), number (e.g., 10), professor, or keywords.
            </div>
          </div>
          <Badge variant="outline" className="rounded-full border-emerald-700 text-emerald-50">
            Showing {catalogRows.length.toLocaleString()} / {catalogTotal.toLocaleString()}
          </Badge>
        </div>

        <Input
          value={catalogDraft}
          onChange={(e) => setCatalogDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyCatalogSearch();
          }}
          placeholder="Try: ECON, COSC, Blanchflower, writing…"
          className="rounded-2xl"
        />

       <div className="flex gap-2 flex-wrap">
          <Button
            className="rounded-2xl bg-emerald-600 text-emerald-950 hover:bg-emerald-500"
            onClick={() => applyCatalogSearch()}
          >
            Search
          </Button>

          <Button
            variant="outline"
            className="rounded-2xl bg-white text-black"
            onClick={() => {
              setCatalogDraft("");
              applyCatalogSearch("");
            }}
          >
            Clear
          </Button>
        </div>

        {catalogError ? <div className="text-sm text-red-300">Error: {catalogError}</div> : null}
        {catalogLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
    
      </CardContent>
    </Card>

    <div className="grid md:grid-cols-2 gap-4">
      {catalogRows.map((c: any) => {
        const selected = selectedSections.some((s) => s.id === c.id);
        const strain = strainLabel(courseStrain(c, chronotypeKey));

        return (
          <Card key={c.id} className="rounded-2xl">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    {c.dept} {c.number}
                  </div>
                  <div className="text-sm text-muted-foreground">{c.title}</div>

                  <div className="text-xs text-muted-foreground mt-1">
                    {c.instructor ? `Prof: ${c.instructor}` : null}
                    {c.dist ? ` • Dist: ${c.dist}` : null}
                  </div>

                  <div className="text-xs text-muted-foreground mt-1">
                    {c.periodRaw || "Arrange"}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Badge className={toneBadge(strain.tone)}>{strain.label}</Badge>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  className="rounded-2xl"
                  onClick={() => {
                    setSelectedSections((prev) =>
                      prev.some((s) => s.id === c.id)
                        ? prev.filter((s) => s.id !== c.id)
                        : [...prev, c]
                    );
                  }}
                >
                  {selected ? "Remove" : "Add to schedule"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </div>
)}
        {/* SCHEDULE */}
        {tab === "schedule" && (
          <div className="space-y-4">
            {!profileCompleted ? (
              <Card className="rounded-2xl border-emerald-900">
                <CardContent className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
                  <ClipboardList className="h-4 w-4" />
                  Create your Profile to add recurring commitments (clubs/sports/hobbies) to this schedule.
                  <Button
                    variant="outline"
                    className="ml-auto rounded-2xl bg-white text-black"
                    onClick={() => setTab("profile")}
                  >
                    Create profile
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            <Card className="rounded-2xl border-emerald-900">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xl font-semibold">Weekly Schedule</div>
                    <div className="text-sm text-muted-foreground">
                      Courses + recurring commitments overlaid on your chronotype.
                    </div>
                  </div>
                  <Badge className={`rounded-full ${toneBadge(overallLabel.tone)}`}>
                    Overall: {overallLabel.label}
                  </Badge>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <Card className="rounded-2xl border-emerald-900">
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">Course alignment</div>
                      <div className="text-2xl font-semibold mt-1">{Math.round(overallMetrics.courseWeighted)}</div>
                      <div className="text-xs text-muted-foreground mt-1">Weighted by time</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border-emerald-900">
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">Commitment alignment</div>
                      <div className="text-2xl font-semibold mt-1">{Math.round(overallMetrics.actWeighted)}</div>
                      <div className="text-xs text-muted-foreground mt-1">Clubs/sports/hobbies</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border-emerald-900">
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">Combined score</div>
                      <div className="text-2xl font-semibold mt-1">{Math.round(overallMetrics.combined)}</div>
                      <div className="text-xs text-muted-foreground mt-1">65% courses • 35% commitments</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Advisory-only prototype (no data stored). Remove any block by clicking the X.
                </div>
              </CardContent>
            </Card>

          <Card className="rounded-2xl border-emerald-900">
            <CardContent className="p-6 space-y-3">

              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">
                    What this score means
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Context for your circadian alignment score.
                  </div>
                </div>

                <Badge className={`rounded-full ${toneBadge(overallLabel.tone)}`}>
                  {alignmentInfo.headline}
                </Badge>

              </div>

              <div className="text-sm text-muted-foreground">
                {alignmentInfo.body}
              </div>

              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                {alignmentInfo.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>

            </CardContent>
          </Card>

<Card className="rounded-2xl border-emerald-900">
  <CardContent className="p-6 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">What’s hurting alignment</div>
        <div className="text-xs text-muted-foreground">
          Automatically detected friction points based on when your blocks occur.
        </div>
      </div>

      <Badge className={`rounded-full ${toneBadge(overallLabel.tone)}`}>
        {alignmentDiagnostics.headline}
      </Badge>
    </div>

    <div className="space-y-2">
      {alignmentDiagnostics.bullets.map((b, i) => (
        <div key={i} className="text-sm text-muted-foreground">
          • {b}
        </div>
      ))}
    </div>

    <div className="text-xs text-muted-foreground pt-1">
      Tip: Use the Catalog “strain” labels to swap into sections that land in your peak window.
    </div>
  </CardContent>
</Card>

            <Grid chronotypeKey={chronotypeKey} itemsByDay={itemsByDay} onRemove={removeFromSchedule} />
          </div>
        )}

        {/* SUMMARY */}
        {tab === "summary" && (
          <div className="space-y-4">
            <Card className="rounded-2xl border-emerald-900">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xl font-semibold">Summary & Recommendations</div>
                    <div className="text-sm text-muted-foreground">
                      A wrap-up that combines courses + commitments to evaluate circadian alignment.
                    </div>
                  </div>
                  <Badge className={`rounded-full ${toneBadge(overallLabel.tone)}`}>
                    Overall: {overallLabel.label}
                  </Badge>
                </div>

                <div className="grid md:grid-cols-4 gap-3">
                  <Card className="rounded-2xl border-emerald-900">
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">Alignment score</div>
                      <div className="text-2xl font-semibold mt-1">{Math.round(overallMetrics.combined)}</div>
                      <div className="text-xs text-muted-foreground mt-1">Combined</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border-emerald-900">
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">High-strain courses</div>
                      <div className="text-2xl font-semibold mt-1">{overallMetrics.highStrainCourses}</div>
                      <div className="text-xs text-muted-foreground mt-1">Score &lt; -35</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border-emerald-900">
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">High-strain commitments</div>
                      <div className="text-2xl font-semibold mt-1">{overallMetrics.highStrainActs}</div>
                      <div className="text-xs text-muted-foreground mt-1">Score &lt; -35</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border-emerald-900">
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">Chronotype</div>
                      <div className="text-2xl font-semibold mt-1">{CHRONOTYPES[chronotypeKey].label}</div>
                      <div className="text-xs text-muted-foreground mt-1">Applied</div>
                    </CardContent>
                  </Card>
                </div>

                <Separator />

          <Card className="rounded-2xl border-emerald-900">
            <CardContent className="p-6 space-y-3">

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">AI Schedule Support Recommendations</div>
                  <div className="text-xs text-muted-foreground">
                    Based on your alignment score + friction points.
                  </div>
                </div>

                <Button
                  className="rounded-2xl bg-white text-black border border-emerald-700 hover:bg-emerald-100"
                  variant="outline"
                  onClick={runAiScheduleSupport}
                  disabled={aiGeneralLoading}
                >
                  AI Recommend
                </Button>
              </div>

              {aiGeneralError ? (
                <div className="text-sm text-red-300">AI Error: {aiGeneralError}</div>
              ) : null}

              {aiGeneralLoading ? (
                <div className="text-sm text-muted-foreground">AI thinking…</div>
              ) : null}

                   {aiGeneralRecs.length ? (
                  <div className="grid md:grid-cols-2 gap-2">
                    {aiGeneralRecs.slice(0, 6).map((r, idx) => (
                      <div key={idx} className="rounded-2xl border border-emerald-900 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">{r.title}</div>
                          {r.priority ? (
                            <Badge variant="outline" className="rounded-full border-emerald-700 text-emerald-50">
                              {r.priority}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">{r.body}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {aiGeneralLoading
                      ? "Generating AI recommendations..."
                      : "Click “AI Recommend” to generate personalized non-course tips."}
                  </div>
                )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-emerald-900">
                  <CardContent className="p-6 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">AI course recommendations</div>
                        <div className="text-xs text-muted-foreground">
                          Uses your chronotype + profile + current schedule to suggest aligned sections.
                        </div>
                      </div>

                      <Button
                        className="rounded-2xl bg-white text-black border border-emerald-700 hover:bg-emerald-100"
                        variant="outline"
                        onClick={runAiCourseRecommend}
                        disabled={aiCourseLoading}
                      >
                        AI Recommend
                      </Button>
                    </div>

                    {aiCourseError ? <div className="text-sm text-red-300">AI Error: {aiCourseError}</div> : null}
                      {aiCourseLoading ? <div className="text-sm text-muted-foreground">AI thinking…</div> : null}

                     {aiCourseLoading ? (
                      <div className="text-sm text-muted-foreground">AI thinking…</div>
                    ) : aiCourseError ? (
                      <div className="text-sm text-red-300">AI Error: {aiCourseError}</div>
                    ) : aiCourseRecs?.length ? (
                      <div className="space-y-3">
                        {aiCourseRecs.slice(0, 6).map((rec: any) => (
                          <div key={courseKey(rec.course)} className="rounded-2xl border border-emerald-900 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold">
                                  {rec.course.dept} {rec.course.number} — {rec.course.title}
                                </div>

                                <div className="text-xs text-muted-foreground mt-1">
                                  Best section: {meetingSummary(rec.best.section)} •{" "}
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full ${toneBadge(rec.best.label.tone)}`}
                                  >
                                    {rec.best.label.label} ({rec.best.strain})
                                  </span>
                                </div>

                                {rec.best.explanation ? (
                                  <div className="text-sm text-muted-foreground mt-2">{rec.best.explanation}</div>
                                ) : null}
                              </div>

                              <Button
                                className="rounded-2xl"
                                onClick={() => {
                                  const c = rec.best.section;
                                  setSelectedSections((prev) => (prev.some((s) => s.id === c.id) ? prev : [...prev, c]));
                                  setTab("catalog");
                                }}
                              >
                                Add best
                              </Button>
                            </div>

                            {rec.alternatives?.length ? (
                              <div className="mt-3 text-xs text-muted-foreground">
                                Alternatives:{" "}
                                {rec.alternatives.map((a: any) => `${meetingSummary(a.section)} (${a.strain})`).join(" • ")}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No AI recommendations yet — click “AI Recommend”.</div>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <div className="text-sm font-semibold">Lifestyle suggestions to support your schedule</div>
                  <div className="grid md:grid-cols-2 gap-2">
                    {recommendations.lifestyle.map((s, idx) => (
                      <div key={idx} className="rounded-2xl border border-emerald-900 p-4">
                        <div className="text-sm font-semibold">{s.title}</div>
                        <div className="text-sm text-muted-foreground mt-1">{s.body}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 text-xs text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Prototype note: This is a conceptual planning tool, not a medical assessment.
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-emerald-900">
              <CardContent className="p-5 text-sm text-muted-foreground">
                <div className="font-semibold text-foreground">Dartmouth framing</div>
                The D-Plan and winter light shifts disrupt consistency. This registrar layer reduces structural strain by making biological time visible in course + activity planning.
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
