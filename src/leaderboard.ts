// Online leaderboard: talks to the Cloudflare Worker API (worker/index.ts).
// The public board only ever receives names and scores; email and phone are
// sent once with the score and are visible to admins only.

export type LeaderboardEntry = {
  id: string;
  name: string;
  score: number;
  switches: number;
  distance: number;
  createdAt: string;
};

export type NewEntry = {
  name: string;
  email: string;
  phone: string;
  consent: boolean;
  score: number;
  switches: number;
  distance: number;
};

export class SubmitError extends Error {}

const REFRESH_MS = 15_000;
const listeners = new Set<(entries: LeaderboardEntry[]) => void>();
let runToken: string | null = null;

async function fetchTop(): Promise<LeaderboardEntry[]> {
  const response = await fetch("/api/leaderboard", { cache: "no-store" });
  if (!response.ok) throw new Error(`leaderboard ${response.status}`);
  const data = (await response.json()) as { scores: LeaderboardEntry[] };
  return data.scores;
}

async function refresh(onError?: (message: string) => void) {
  try {
    const entries = await fetchTop();
    listeners.forEach((listener) => listener(entries));
  } catch {
    onError?.("Leaderboard unavailable right now");
  }
}

export function subscribeLeaderboard(
  onChange: (entries: LeaderboardEntry[]) => void,
  onError: (message: string) => void,
): () => void {
  listeners.add(onChange);
  void refresh(onError);
  const timer = window.setInterval(() => void refresh(onError), REFRESH_MS);
  return () => {
    listeners.delete(onChange);
    window.clearInterval(timer);
  };
}

/** Call when a run starts; the server signs the start time to check the score later. */
export async function startRun() {
  runToken = null;
  try {
    const response = await fetch("/api/runs", { method: "POST" });
    if (response.ok) runToken = ((await response.json()) as { token: string }).token;
  } catch {
    // Offline: the save will report that the game could not be verified.
  }
}

/** Saves the run; resolves the new entry id and its worldwide rank. */
export async function addScore(entry: NewEntry): Promise<{ id: string; rank: number }> {
  let response: Response;
  try {
    response = await fetch("/api/scores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...entry, runToken }),
    });
  } catch {
    throw new SubmitError("Couldn't reach the server. Check your connection and try again.");
  }
  const data = (await response.json().catch(() => ({}))) as { id?: string; rank?: number; error?: string };
  if (!response.ok || !data.id) throw new SubmitError(data.error ?? "Couldn't save your score. Please try again.");
  runToken = null;
  void refresh();
  return { id: data.id, rank: data.rank ?? 0 };
}
