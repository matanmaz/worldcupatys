// Place this file at: functions/api/[[route]].js
// Cloudflare Pages will auto-deploy it alongside index.html.
//
// Endpoints:
//   GET  /api/results            -> { results: { matchId: count, ... } }
//   GET  /api/user?name=Foo      -> { name, votes, spent, remaining }
//   POST /api/vote               -> body: { name, matchId, delta: +1|-1 }
//   GET  /api/admin?key=SECRET   -> { matches, users, totalVoters }
//
// KV binding required: VOTES   (configure in Pages dashboard)
// Env var (recommended):   ADMIN_KEY  (configure in Pages dashboard)

const POINTS_BUDGET = 10;
const FALLBACK_ADMIN_KEY = "change-me-in-pages-settings";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function normalizeName(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === "OPTIONS") return json({ ok: true });

  const url = new URL(request.url);
  const segs = Array.isArray(params.route) ? params.route : [params.route].filter(Boolean);
  const route = segs.join("/");

  const KV = env.VOTES;
  if (!KV) return json({ error: "KV namespace 'VOTES' not bound" }, 500);

  try {
    if (route === "results" && request.method === "GET") {
      return json(await getResults(KV));
    }
    if (route === "user" && request.method === "GET") {
      const name = url.searchParams.get("name");
      if (!name || !name.trim()) return json({ error: "name required" }, 400);
      return json(await getUser(KV, name));
    }
    if (route === "vote" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return await castVote(KV, body);
    }
    if (route === "admin" && request.method === "GET") {
      const key = url.searchParams.get("key");
      const adminKey = env.ADMIN_KEY || FALLBACK_ADMIN_KEY;
      if (!key || key !== adminKey) return json({ error: "unauthorized" }, 401);
      return json(await getAdmin(KV));
    }
    return json({ error: "not found", route }, 404);
  } catch (err) {
    return json({ error: err.message || "server error" }, 500);
  }
}

async function getResults(KV) {
  const list = await KV.list({ prefix: "match:" });
  const results = {};
  await Promise.all(
    list.keys.map(async (k) => {
      const v = await KV.get(k.name);
      results[k.name.slice("match:".length)] = parseInt(v || "0", 10);
    })
  );
  return { results };
}

async function getUser(KV, name) {
  const key = "user:" + normalizeName(name);
  const raw = await KV.get(key);
  const data = raw ? JSON.parse(raw) : { votes: {}, total: 0 };
  return {
    name,
    votes: data.votes || {},
    spent: data.total || 0,
    remaining: POINTS_BUDGET - (data.total || 0),
  };
}

async function castVote(KV, body) {
  const { name, matchId, delta } = body || {};
  if (!name || !String(name).trim()) return json({ error: "name required" }, 400);
  if (!matchId) return json({ error: "matchId required" }, 400);
  const d = parseInt(delta, 10);
  if (d !== 1 && d !== -1) return json({ error: "delta must be +1 or -1" }, 400);

  const safeMatchId = String(matchId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
  if (!safeMatchId) return json({ error: "invalid matchId" }, 400);

  const userKey = "user:" + normalizeName(name);
  const matchKey = "match:" + safeMatchId;

  // Load user
  const userRaw = await KV.get(userKey);
  const user = userRaw
    ? JSON.parse(userRaw)
    : { votes: {}, total: 0, displayName: String(name).trim().slice(0, 60), firstSeen: Date.now() };

  const current = user.votes[safeMatchId] || 0;

  if (d === 1 && user.total >= POINTS_BUDGET) {
    return json({ error: "no points remaining", remaining: 0 }, 400);
  }
  if (d === -1 && current <= 0) {
    return json({ error: "cannot go below zero" }, 400);
  }

  user.votes[safeMatchId] = current + d;
  user.total = (user.total || 0) + d;
  user.lastVote = Date.now();
  if (!user.displayName) user.displayName = String(name).trim().slice(0, 60);

  await KV.put(userKey, JSON.stringify(user));

  // Update match counter (note: KV is eventually consistent — fine for this scale)
  const matchRaw = await KV.get(matchKey);
  const newCount = Math.max(0, parseInt(matchRaw || "0", 10) + d);
  await KV.put(matchKey, String(newCount));

  return json({
    ok: true,
    matchId: safeMatchId,
    matchTotal: newCount,
    userVotes: user.votes,
    spent: user.total,
    remaining: POINTS_BUDGET - user.total,
  });
}

async function getAdmin(KV) {
  const [matchList, userList] = await Promise.all([
    KV.list({ prefix: "match:" }),
    KV.list({ prefix: "user:" }),
  ]);

  const matches = {};
  await Promise.all(
    matchList.keys.map(async (k) => {
      const v = await KV.get(k.name);
      matches[k.name.slice("match:".length)] = parseInt(v || "0", 10);
    })
  );

  const users = [];
  await Promise.all(
    userList.keys.map(async (k) => {
      const raw = await KV.get(k.name);
      if (!raw) return;
      const u = JSON.parse(raw);
      users.push({
        name: u.displayName || k.name.slice("user:".length),
        spent: u.total || 0,
        votes: u.votes || {},
        firstSeen: u.firstSeen,
        lastVote: u.lastVote,
      });
    })
  );

  users.sort((a, b) => (b.lastVote || 0) - (a.lastVote || 0));

  return {
    matches,
    users,
    totalVoters: users.length,
    totalVotes: Object.values(matches).reduce((a, b) => a + b, 0),
  };
}
