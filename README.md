# BeerFactory Game

Realtime team quiz for venue events. No database: runtime state is kept in memory and persisted atomically to JSON.

## What already works

- Dynamic number of teams.
- Editable team names.
- Unique join code and QR for every team.
- Dynamic number of players; each guest joins with a name.
- Host panel at `/host`.
- Projector/public screen at `/screen`.
- Player flow at `/join/:code`.
- Realtime synchronization through Socket.IO.
- Questions with four answer options and a server-side timer.
- One answer per player per round.
- Players joining after a round starts wait until the next question.
- Team result = correct answers / players eligible at round start.
- Tie-break = lower average response time among correct answers.
- Winning team gets +1 point.
- State survives process restarts through `data/game-state.json`.
- Writes are atomic: temp file + rename.

## Run locally

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000/host`
- `http://localhost:3000/screen`

Create teams in the host panel, then open or print each team's QR.

## Questions

Edit `data/questions.json`.

```json
{
  "id": "q4",
  "text": "Текст вопроса",
  "options": ["A", "B", "C", "D"],
  "correctOption": 1,
  "durationSec": 20
}
```

`correctOption` is zero-based: 0 = first option, 1 = second, etc.

## Persistence

The app creates `data/game-state.json` automatically on first run.

For production, deploy it somewhere with a persistent writable filesystem. A purely ephemeral/serverless host is not suitable for this JSON-only persistence model.

Optional environment variables:

- `PORT` — server port, default 3000.
- `PUBLIC_URL` — public base URL used when generating QR links, e.g. `https://game.example.ru`.
