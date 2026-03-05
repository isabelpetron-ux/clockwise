import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // important: keep API key on server

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function llmGeneralRecs(body: any) {
  const system = `
You are a scheduling coach for a Dartmouth student using a chronotype planner.
Return STRICT JSON only.
Schema:
{
  "generalRecommendations": [
    { "title": string, "body": string, "priority": "high" | "medium" | "low" }
  ]
}
Rules:
- 4–6 items max
- make them specific to the provided alignment + diagnostics
- no markdown
`;

  const resp = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(body) },
    ],
    text: { format: { type: "json_object" } },
  });

  const text = resp.output_text ?? "{}";
  const json = JSON.parse(text);
  return Array.isArray(json.generalRecommendations) ? json.generalRecommendations : [];
}

async function llmCourseRecs(body: any) {
  const system = `
You recommend course SECTIONS that best fit a student's chronotype and schedule.
Return STRICT JSON only.
Schema:
{
  "courseRecommendations": [
    { "sectionId": string, "explanation": string, "priority": "high" | "medium" | "low" }
  ]
}
Rules:
- Recommend up to 8 sections
- Use ONLY the provided candidates (match by id)
- no markdown
`;

  const resp = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(body) },
    ],
    text: { format: { type: "json_object" } },
  });

  const text = resp.output_text ?? "{}";
  const json = JSON.parse(text);
  return Array.isArray(json.courseRecommendations) ? json.courseRecommendations : [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body?.mode;

    const base = {
      generalRecommendations: [] as any[],
      courseRecommendations: [] as any[],
    };

    // If no key, fall back to your existing rules-based behavior
    const hasKey = Boolean(process.env.OPENAI_API_KEY);

    if (mode === "general") {
      if (!hasKey) {
        const recs = buildGeneralRecs(body);
        return NextResponse.json({ ...base, generalRecommendations: recs });
      }

      const recs = await llmGeneralRecs(body);
      return NextResponse.json({ ...base, generalRecommendations: recs });
    }

    if (mode === "courses") {
      const candidates = Array.isArray(body?.candidates) ? body.candidates : [];

      if (!candidates.length) {
        return NextResponse.json({ ...base, courseRecommendations: [] });
      }

      if (!hasKey) {
        const recs = buildCourseRecsFromCandidates(body);
        return NextResponse.json({ ...base, courseRecommendations: recs });
      }

      // LLM returns sectionId + explanation, we map back to your expected shape:
      const llm = await llmCourseRecs(body);
      const byId = new Map(candidates.map((c: any) => [String(c.id), c]));

      const recs = llm
        .map((r: any) => {
          const section = byId.get(String(r.sectionId));
          if (!section) return null;
          return { section, explanation: r.explanation };
        })
        .filter(Boolean);

      return NextResponse.json({ ...base, courseRecommendations: recs });
    }

    return NextResponse.json(
      { ...base, error: `Unknown mode: ${String(mode)}` },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        generalRecommendations: [],
        courseRecommendations: [],
        error: err?.message || "Server error",
      },
      { status: 500 }
    );
  }
}

// --- your existing helpers stay as fallback ---
function buildGeneralRecs(body: any) {
  const chronotypeKey = body?.chronotypeKey;
  const score = body?.alignment?.score ?? 0;
  const diagnostics: string[] = body?.alignment?.diagnostics ?? [];

  const out: any[] = [];

  out.push({
    title: "1 change to reduce strain",
    body:
      diagnostics[0] ??
      `Based on your ${chronotypeKey} chronotype, aim to place demanding work in your peak window and protect a consistent wind-down.`,
    priority: "high",
  });

  out.push({
    title: "Light + caffeine timing",
    body:
      "Get bright light within 30–60 min of waking; set a caffeine cutoff so it doesn’t push sleep later.",
    priority: "medium",
  });

  out.push({
    title: "Consistency target",
    body:
      score < 0
        ? "Try keeping wake time within ~60–90 minutes across the week to reduce ‘social jet lag’."
        : "Keep wake time consistent to preserve your current alignment.",
    priority: "medium",
  });

  return out;
}

function buildCourseRecsFromCandidates(body: any) {
  const candidates = body.candidates as any[];
  return candidates.slice(0, 10).map((section) => ({
    section,
    explanation: "Recommended based on your chronotype and current schedule.",
  }));
}