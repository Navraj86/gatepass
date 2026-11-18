import "server-only";

// Server components call the API directly over the private network. With two
// API instances listed, a restarting one is skipped.
const origins = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").split(",").map((s) => s.trim());

export async function serverApi<T>(path: string): Promise<T | null> {
  let lastError: unknown;
  for (const origin of origins) {
    try {
      const response = await fetch(`${origin}${path}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`API answered ${response.status} for ${path}`);
      return (await response.json()) as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
