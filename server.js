import express from "express";
import http from "http";
import { Server } from "socket.io";
import QRCode from "qrcode";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "game-state.json");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const PORT = Number(process.env.PORT || 3000);

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
    results: []
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
  return {
    teams: state.teams.map(t => ({
      ...t,
      players: state.players.filter(p => p.teamId === t.id)
    })),
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
  if (best) {
    const winners = ranked.filter(r => r.accuracy === best.accuracy && r.avgCorrectMs === best.avgCorrectMs);
    for (const winner of winners) {
      const team = state.teams.find(t => t.id === winner.teamId);
      if (team) team.score += 1;
    }
    for (const row of ranked) row.winner = winners.some(w => w.teamId === row.teamId);
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

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req,res) => res.redirect("/screen"));
app.get("/host", (_req,res) => res.sendFile(path.join(__dirname, "public/host.html")));
app.get("/screen", (_req,res) => res.sendFile(path.join(__dirname, "public/screen.html")));
app.get("/join/:code", (_req,res) => res.sendFile(path.join(__dirname, "public/player.html")));

app.get("/api/public-state", (_req,res) => res.json(publicState()));
app.get("/api/host-state", (_req,res) => res.json(hostState()));
app.get("/api/player-state/:playerId", (req,res) => {
  const view = playerState(req.params.playerId);
  if (!view) return res.status(404).json({ error: "Игрок не найден" });
  res.json(view);
});

app.post("/api/host/teams", async (req,res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Введите название команды" });
  const team = { id: id("team"), name: name.slice(0,40), joinCode: makeJoinCode(), score: 0, createdAt: Date.now() };
  state.teams.push(team);
  await persist();
  io.emit("state:changed");
  res.status(201).json(team);
});

app.patch("/api/host/teams/:id", async (req,res) => {
  const team = state.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: "Команда не найдена" });
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Введите название команды" });
  team.name = name.slice(0,40);
  await persist();
  io.emit("state:changed");
  res.json(team);
});

app.delete("/api/host/teams/:id", async (req,res) => {
  if (state.round.status === "open") return res.status(409).json({ error: "Нельзя удалять команду во время вопроса" });
  state.teams = state.teams.filter(t => t.id !== req.params.id);
  state.players = state.players.filter(p => p.teamId !== req.params.id);
  await persist();
  io.emit("state:changed");
  res.status(204).end();
});

app.post("/api/join/:code", async (req,res) => {
  const team = state.teams.find(t => t.joinCode === String(req.params.code).toUpperCase());
  if (!team) return res.status(404).json({ error: "Команда не найдена" });
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Введите имя" });

  let player = null;
  const requestedId = String(req.body.playerId || "");
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
  const player = state.players.find(p => p.id === req.body.playerId);
  if (!player) return res.status(404).json({ error: "Игрок не найден" });
  if (!state.round.eligiblePlayerIds.includes(player.id)) {
    return res.status(409).json({ error: "Вы присоединились после начала вопроса. Следующий раунд уже ваш." });
  }
  const q = getQuestion(state.round.questionId);
  const option = Number(req.body.option);
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

app.post("/api/host/round/start", async (req,res) => {
  if (state.round.status === "open") return res.status(409).json({ error: "Сначала завершите текущий вопрос" });
  const q = getQuestion(String(req.body.questionId || ""));
  if (!q) return res.status(404).json({ error: "Вопрос не найден" });
  const now = Date.now();
  state.answers[q.id] = {};
  state.round = {
    questionId: q.id,
    status: "open",
    startedAt: now,
    endsAt: now + q.durationSec * 1000,
    eligiblePlayerIds: state.players.map(p => p.id),
    results: []
  };
  await persist();
  scheduleRoundTimer();
  io.emit("state:changed");
  res.json(hostState().round);
});

app.post("/api/host/round/close", async (_req,res) => {
  await closeRound();
  res.json(hostState().round);
});

app.post("/api/host/round/reveal", async (_req,res) => {
  if (!["closed","revealed"].includes(state.round.status)) return res.status(409).json({ error: "Сначала завершите вопрос" });
  state.round.status = "revealed";
  await persist();
  io.emit("state:changed");
  res.json(hostState().round);
});

app.post("/api/host/round/clear", async (_req,res) => {
  clearTimeout(roundTimer);
  state.round = emptyState().round;
  await persist();
  io.emit("state:changed");
  res.json({ ok: true });
});

app.post("/api/host/reset-scores", async (_req,res) => {
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

io.on("connection", socket => {
  socket.emit("state:changed");
});

await loadData();
scheduleRoundTimer();
server.listen(PORT, () => console.log(`BeerFactory Game: http://localhost:${PORT}`));
