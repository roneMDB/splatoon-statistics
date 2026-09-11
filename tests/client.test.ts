import { describe, expect, test } from "vitest";
import { fetchBattlePage } from "../src/statink/client.ts";
import { USER_AGENT } from "../src/config.ts";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Enregistre les appels et rejoue des reponses dans l'ordre. */
function stubFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; headers: Headers }> = [];
  let index = 0;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: new Headers(init?.headers) });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return next!.clone();
  };
  return { calls, fetchImpl };
}

/** sleep instantane : on verifie le backoff sans attendre reellement. */
function stubSleep() {
  const delays: number[] = [];
  return { delays, sleepImpl: async (ms: number) => void delays.push(ms) };
}

const request = { user: "Gloup", page: 1 } as const;

describe("fetchBattlePage", () => {
  test("renvoie les matchs de la reponse", async () => {
    const { fetchImpl } = stubFetch([jsonResponse([{ uuid: "a" }, { uuid: "b" }])]);
    const battles = await fetchBattlePage(request, { fetch: fetchImpl });
    expect(battles.map((b) => b.uuid)).toEqual(["a", "b"]);
  });

  test("envoie un User-Agent de navigateur, sinon Cloudflare renvoie 403", async () => {
    const { calls, fetchImpl } = stubFetch([jsonResponse([])]);
    await fetchBattlePage(request, { fetch: fetchImpl });
    expect(calls[0]!.headers.get("user-agent")).toBe(USER_AGENT);
  });

  test("interroge l'URL construite pour la page demandee", async () => {
    const { calls, fetchImpl } = stubFetch([jsonResponse([])]);
    await fetchBattlePage({ user: "Gloup", page: 2 }, { fetch: fetchImpl });
    expect(calls[0]!.url).toContain("/@Gloup/spl3/index.json");
    expect(calls[0]!.url).toContain("page=2");
  });

  test("explique un 403 par le User-Agent refuse", async () => {
    const { fetchImpl } = stubFetch([new Response("denied", { status: 403 })]);
    await expect(fetchBattlePage(request, { fetch: fetchImpl })).rejects.toThrow(
      /User-Agent/,
    );
  });

  test("n'insiste pas sur un 403", async () => {
    const { calls, fetchImpl } = stubFetch([new Response("denied", { status: 403 })]);
    await expect(fetchBattlePage(request, { fetch: fetchImpl })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  test("explique un 404 par un compte inconnu ou non public", async () => {
    const { fetchImpl } = stubFetch([new Response("nope", { status: 404 })]);
    await expect(
      fetchBattlePage({ user: "Inconnu", page: 1 }, { fetch: fetchImpl }),
    ).rejects.toThrow(/public|inconnu/i);
  });

  test("reessaie apres une erreur serveur puis reussit", async () => {
    const { calls, fetchImpl } = stubFetch([
      new Response("boom", { status: 503 }),
      jsonResponse([{ uuid: "a" }]),
    ]);
    const { sleepImpl } = stubSleep();
    const battles = await fetchBattlePage(request, {
      fetch: fetchImpl,
      sleep: sleepImpl,
    });
    expect(battles).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  test("abandonne apres 3 tentatives sur erreur serveur persistante", async () => {
    const { calls, fetchImpl } = stubFetch([new Response("boom", { status: 500 })]);
    const { sleepImpl } = stubSleep();
    await expect(
      fetchBattlePage(request, { fetch: fetchImpl, sleep: sleepImpl }),
    ).rejects.toThrow(/500/);
    expect(calls).toHaveLength(3);
  });

  test("espace les reprises avec un backoff exponentiel", async () => {
    const { fetchImpl } = stubFetch([new Response("boom", { status: 500 })]);
    const { delays, sleepImpl } = stubSleep();
    await expect(
      fetchBattlePage(request, { fetch: fetchImpl, sleep: sleepImpl }),
    ).rejects.toThrow();
    expect(delays).toEqual([500, 1000]);
  });

  test("reessaie apres une erreur reseau", async () => {
    const { calls, fetchImpl } = stubFetch([
      new Error("ECONNRESET"),
      jsonResponse([{ uuid: "a" }]),
    ]);
    const { sleepImpl } = stubSleep();
    const battles = await fetchBattlePage(request, {
      fetch: fetchImpl,
      sleep: sleepImpl,
    });
    expect(battles).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  test("signale un JSON illisible en citant le debut de la reponse", async () => {
    const { fetchImpl } = stubFetch([new Response("<html>Just a moment...</html>")]);
    await expect(fetchBattlePage(request, { fetch: fetchImpl })).rejects.toThrow(
      /Just a moment/,
    );
  });

  test("refuse une reponse JSON qui n'est pas une liste", async () => {
    const { fetchImpl } = stubFetch([jsonResponse({ error: "nope" })]);
    await expect(fetchBattlePage(request, { fetch: fetchImpl })).rejects.toThrow(
      /liste/i,
    );
  });
});
