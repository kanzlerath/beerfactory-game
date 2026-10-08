import express from "express";
import http from "http";
import { Server } from "socket.io";
import QRCode from "qrcode";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "game-state.json");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const PORT = Number(process.env.PORT || 3000);
const HOST_PIN = String(process.env.HOST_PIN || "1212");

const emptyState = () => ({
  version: 1,
  teams: [],
  players: [],
  answers: {},
  round: {
    questionId: null,
    status: "idle",
    startedAt: null,
    endsAt: null,
    eligiblePlayerIds: [],
    results: [],
    scoresApplied: false
  }
});

let questions = [];
let state = emptyState();
let saveChain = Promise.resolve();
let roundTimer = null;

async function loadData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  questions = JSON.parse(await fs.readFile(QUESTIONS_FILE, "utf8"));
  try {
    state = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
    // States created by earlier versions already awarded points at close.
    if (state.round?.status === "closed" && state.round.scoresApplied === undefined) {
      state.round.scoresApplied = true;
    }
  } catch {
    state = emptyState();
    await persist();
  }
}

function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  saveChain = saveChain.then(async () => {
    const tmp = STATE_FILE + ".tmp";
    await fs.writeFile(tmp, snapshot, "utf8");
    await fs.rename(tmp, STATE_FILE);
  }).catch((err) => console.error("State save failed:", err));
  return saveChain;
}

function id(prefix) {
  return prefix + "_" + crypto.randomBytes(6).toString("hex");
}

function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (state.teams.some(t => t.joinCode === code));
  return code;
}

function getQuestion(questionId) {
  return questions.find(q => q.id === questionId) || null;
}

function publicQuestion(q, reveal = false) {
  if (!q) return null;
  return {
    id: q.id,
    text: q.text,
    options: q.options,
    durationSec: q.durationSec,
    round: q.round || 1,
    roundTitle: q.roundTitle || "Квиз",
    questionNumber: q.questionNumber || 1,
    points: q.points || 1,
    ...(reveal ? { correctOption: q.correctOption } : {})
  };
}

function standings() {
  return [...state.teams]
    .sort((a,b) => b.score - a.score || a.createdAt - b.createdAt)
    .map((t, index) => ({
      id: t.id,
      name: t.name,
      score: t.score,
      rank: index + 1,
      players: state.players.filter(p => p.teamId === t.id).length
    }));
}

function publicState() {
  const reveal = state.round.status === "revealed";
  return {
    teams: standings(),
    round: {
      ...state.round,
      eligiblePlayerIds: undefined,
      question: publicQuestion(getQuestion(state.round.questionId), reveal)
    }
  };
}

function hostState() {
  const currentAnswers = state.round.questionId ? (state.answers[state.round.questionId] || {}) : {};
  return {
    teams: state.teams.map(t => {
      const players = state.players.filter(p => p.teamId === t.id);
      const eligible = new Set(state.round.eligiblePlayerIds || []);
      const eligiblePlayers = players.filter(p => eligible.has(p.id));
      const answered = eligiblePlayers.filter(p => currentAnswers[p.id]).length;
      return { ...t, players, roundProgress: { eligible: eligiblePlayers.length, answered } };
    }),
    questions,
    round: {
      ...state.round,
      question: getQuestion(state.round.questionId)
    },
    standings: standings()
  };
}

function playerState(playerId) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return null;
  const team = state.teams.find(t => t.id === player.teamId);
  const eligible = state.round.eligiblePlayerIds.includes(player.id);
  const answer = state.round.questionId ? state.answers[state.round.questionId]?.[player.id] : null;
  return {
    player,
    team: team ? { id: team.id, name: team.name, score: team.score } : null,
    round: {
      status: state.round.status,
      question: publicQuestion(getQuestion(state.round.questionId), state.round.status === "revealed"),
      startedAt: state.round.startedAt,
      endsAt: state.round.endsAt,
      eligible,
      answer: answer || null,
      results: state.round.status === "revealed" ? state.round.results : []
    }
  };
}

function calculateResults() {
  const q = getQuestion(state.round.questionId);
  if (!q) return [];
  const eligible = new Set(state.round.eligiblePlayerIds);
  const answers = state.answers[q.id] || {};

  const rows = state.teams.map(team => {
    const teamPlayers = state.players.filter(p => p.teamId === team.id && eligible.has(p.id));
    const submitted = teamPlayers.map(p => ({ player: p, answer: answers[p.id] })).filter(x => x.answer);
    const correct = submitted.filter(x => x.answer.option === q.correctOption);
    const accuracy = teamPlayers.length ? correct.length / teamPlayers.length : 0;
    const avgCorrectMs = correct.length
      ? correct.reduce((sum, x) => sum + (x.answer.answeredAt - state.round.startedAt), 0) / correct.length
      : Number.POSITIVE_INFINITY;
    return {
      teamId: team.id,
      teamName: team.name,
      eligible: teamPlayers.length,
      submitted: submitted.length,
      correct: correct.length,
      accuracy,
      avgCorrectMs
    };
  }).filter(r => r.eligible > 0);

  const ranked = [...rows].sort((a,b) =>
    b.accuracy - a.accuracy ||
    a.avgCorrectMs - b.avgCorrectMs ||
    a.teamName.localeCompare(b.teamName, "ru")
  );

  const best = ranked[0];
  if (best && best.correct > 0) {
    const winners = ranked.filter(r => r.accuracy === best.accuracy && r.avgCorrectMs === best.avgCorrectMs);
    for (const row of ranked) {
      row.winner = winners.some(w => w.teamId === row.teamId);
      row.awardedPoints = row.winner ? (q.points || 1) : 0;
    }
  }
  return ranked;
}

async function closeRound() {
  if (state.round.status !== "open") return;
  clearTimeout(roundTimer);
  roundTimer = null;
  state.round.status = "closed";
  state.round.results = calculateResults();
  await persist();
  io.emit("state:changed");
}

function scheduleRoundTimer() {
  clearTimeout(roundTimer);
  roundTimer = null;
  if (state.round.status !== "open" || !state.round.endsAt) return;
  const delay = state.round.endsAt - Date.now();
  if (delay <= 0) closeRound();
  else roundTimer = setTimeout(closeRound, delay);
}

function requireHost(req, res, next) {
  const pin = String(req.get("x-host-pin") || req.body?.pin || "");
  if (pin !== HOST_PIN) return res.status(401).json({ error: "Неверный PIN ведущего" });
  next();
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req,res) => res.redirect("/join"));
app.get("/host", (_req,res) => res.sendFile(path.join(__dirname, "public/host.html")));
app.get("/screen", (_req,res) => res.sendFile(path.join(__dirname, "public/screen.html")));
app.get("/join", (_req,res) => res.sendFile(path.join(__dirname, "public/lobby.html")));
app.get("/join/:code", (_req,res) => res.sendFile(path.join(__dirname, "public/player.html")));

app.get("/api/public-state", (_req,res) => res.json(publicState()));
app.get("/api/public-teams", (_req,res) => res.json(
  state.teams.map(t => ({
    id: t.id,
    name: t.name,
    joinCode: t.joinCode,
    players: state.players.filter(p => p.teamId === t.id).length
  })).sort((a,b) => a.name.localeCompare(b.name, "ru"))
));
app.post("/api/host/auth", (req,res) => {
  if (String(req.body?.pin || "") !== HOST_PIN) return res.status(401).json({ error: "Неверный PIN ведущего" });
  res.json({ ok: true });
});
app.get("/api/host-state", requireHost, (_req,res) => res.json(hostState()));
app.get("/api/player-state/:playerId", (req,res) => {
  const view = playerState(req.params.playerId);
  if (!view) return res.status(404).json({ error: "Игрок не найден" });
  res.json(view);
});

app.post("/api/host/teams", requireHost, async (req,res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Введите название команды" });
  const team = { id: id("team"), name: name.slice(0,40), joinCode: makeJoinCode(), score: 0, createdAt: Date.now() };
  state.teams.push(team);
  await persist();
  io.emit("state:changed");
  res.status(201).json(team);
});

app.patch("/api/host/teams/:id", requireHost, async (req,res) => {
  const team = state.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: "Команда не найдена" });
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Введите название команды" });
  team.name = name.slice(0,40);
  await persist();
  io.emit("state:changed");
  res.json(team);
});

app.delete("/api/host/teams/:id", requireHost, async (req,res) => {
  if (state.round.status === "open") return res.status(409).json({ error: "Нельзя удалять команду во время вопроса" });
  state.teams = state.teams.filter(t => t.id !== req.params.id);
  state.players = state.players.filter(p => p.teamId !== req.params.id);
  await persist();
  io.emit("state:changed");
  res.status(204).end();
});

app.delete("/api/host/players/:id", requireHost, async (req,res) => {
  if (state.round.status === "open" && state.round.eligiblePlayerIds.includes(req.params.id)) {
    return res.status(409).json({ error: "Нельзя удалять участника во время активного вопроса" });
  }
  const exists = state.players.some(p => p.id === req.params.id);
  if (!exists) return res.status(404).json({ error: "Игрок не найден" });
  state.players = state.players.filter(p => p.id !== req.params.id);
  for (const answers of Object.values(state.answers)) delete answers[req.params.id];
  await persist();
  io.emit("state:changed");
  res.status(204).end();
});

app.post("/api/host/teams/:id/score", requireHost, async (req,res) => {
  if (state.round.status === "open") return res.status(409).json({ error: "Менять счёт во время вопроса нельзя" });
  const team = state.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: "Команда не найдена" });
  const delta = Number(req.body?.delta);
  if (!Number.isInteger(delta) || Math.abs(delta) > 10) return res.status(400).json({ error: "Некорректное изменение счёта" });
  team.score = Math.max(0, team.score + delta);
  await persist();
  io.emit("state:changed");
  res.json({ score: team.score });
});

app.post("/api/join/:code", async (req,res) => {
  const team = state.teams.find(t => t.joinCode === String(req.params.code).toUpperCase());
  if (!team) return res.status(404).json({ error: "Команда не найдена" });
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Введите имя" });

  let player = null;
  const requestedId = String(req.body?.playerId || "");
  if (requestedId) player = state.players.find(p => p.id === requestedId && p.teamId === team.id) || null;

  if (!player) {
    player = { id: id("player"), name: name.slice(0,30), teamId: team.id, joinedAt: Date.now() };
    state.players.push(player);
  } else {
    player.name = name.slice(0,30);
  }
  await persist();
  io.emit("state:changed");
  res.json({ player, team: { id: team.id, name: team.name } });
});

app.post("/api/answer", async (req,res) => {
  if (state.round.status !== "open") return res.status(409).json({ error: "Сейчас нет активного вопроса" });
  if (Date.now() > state.round.endsAt) {
    await closeRound();
    return res.status(409).json({ error: "Время вышло" });
  }
  const player = state.players.find(p => p.id === req.body?.playerId);
  if (!player) return res.status(404).json({ error: "Игрок не найден" });
  if (!state.round.eligiblePlayerIds.includes(player.id)) {
    return res.status(409).json({ error: "Вы присоединились после начала вопроса. Следующий раунд уже ваш." });
  }
  const q = getQuestion(state.round.questionId);
  const option = Number(req.body?.option);
  if (!q || !Number.isInteger(option) || option < 0 || option >= q.options.length) {
    return res.status(400).json({ error: "Некорректный ответ" });
  }
  state.answers[q.id] ||= {};
  if (state.answers[q.id][player.id]) return res.status(409).json({ error: "Ответ уже принят" });
  state.answers[q.id][player.id] = { option, answeredAt: Date.now() };
  await persist();
  io.emit("state:changed");
  res.json({ ok: true });
});

app.post("/api/host/round/start", requireHost, async (req,res) => {
  if (state.round.status === "open") return res.status(409).json({ error: "Сначала завершите текущий вопрос" });
  const q = getQuestion(String(req.body?.questionId || ""));
  if (!q) return res.status(404).json({ error: "Вопрос не найден" });
  const now = Date.now();
  state.answers[q.id] = {};
  state.round = {
    questionId: q.id,
    status: "open",
    startedAt: now,
    endsAt: now + q.durationSec * 1000,
    eligiblePlayerIds: state.players.map(p => p.id),
    results: [],
    scoresApplied: false
  };
  await persist();
  scheduleRoundTimer();
  io.emit("state:changed");
  res.json(hostState().round);
});

app.post("/api/host/round/close", requireHost, async (_req,res) => {
  await closeRound();
  res.json(hostState().round);
});

app.post("/api/host/round/reveal", requireHost, async (_req,res) => {
  if (!["closed","revealed"].includes(state.round.status)) return res.status(409).json({ error: "Сначала завершите вопрос" });
  if (state.round.status === "closed" && !state.round.scoresApplied) {
    for (const row of state.round.results) {
      if (!row.winner) continue;
      const team = state.teams.find(t => t.id === row.teamId);
      if (team) team.score += (row.awardedPoints || 1);
    }
    state.round.scoresApplied = true;
  }
  state.round.status = "revealed";
  await persist();
  io.emit("state:changed");
  res.json(hostState().round);
});

app.post("/api/host/final", requireHost, async (_req,res) => {
  if (state.round.status === "open") return res.status(409).json({ error: "Сначала завершите вопрос" });
  state.round.status = "final";
  await persist();
  io.emit("state:changed");
  res.json({ ok: true, standings: standings() });
});

app.post("/api/host/round/clear", requireHost, async (_req,res) => {
  clearTimeout(roundTimer);
  state.round = emptyState().round;
  await persist();
  io.emit("state:changed");
  res.json({ ok: true });
});

app.post("/api/host/reset-scores", requireHost, async (_req,res) => {
  if (state.round.status === "open") return res.status(409).json({ error: "Нельзя сбрасывать счёт во время вопроса" });
  state.teams.forEach(t => t.score = 0);
  await persist();
  io.emit("state:changed");
  res.json({ ok: true });
});

app.get("/api/teams/:id/qr.svg", async (req,res) => {
  const team = state.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).end();
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  const svg = await QRCode.toString(`${base}/join/${team.joinCode}`, { type: "svg", margin: 1, width: 360 });
  res.type("image/svg+xml").send(svg);
});

app.get("/api/join-qr.svg", async (req,res) => {
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  const svg = await QRCode.toString(`${base}/join`, { type: "svg", margin: 1, width: 360 });
  res.type("image/svg+xml").send(svg);
});

app.get("/api/health", (_req,res) => res.json({ ok: true, teams: state.teams.length, players: state.players.length, round: state.round.status }));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

io.on("connection", socket => {
  socket.emit("state:changed");
});

await loadData();
scheduleRoundTimer();
server.listen(PORT, () => console.log(`BeerFactory Game: http://localhost:${PORT}`));
