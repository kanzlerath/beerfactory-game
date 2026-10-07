# BeerFactory Game

Realtime team quiz for venue events. No database: runtime state is kept in memory and persisted atomically to JSON.

## Current MVP

- Dynamic teams and editable team names.
- Unlimited practical player count for the event scale.
- Individual team QR codes.
- One common QR at `/join` with team selection.
- Host panel at `/host`, protected by a PIN.
- Projector screen at `/screen`.
- Player flow at `/join/:code`.
- Realtime synchronization through Socket.IO.
- Server-side round timer.
- One answer per player per round.
- Players joining after a round begins start on the next question.
- Team result = correct answers / players eligible at round start.
- Tie-break = lower average response time among correct answers.
- Winning team receives +1 point.
- JSON persistence with atomic temp-file + rename writes.
- Automatic restore after process restart.

## Run locally

```bash
npm install
HOST_PIN=2486 npm run dev
```

Then open:

- `http://localhost:3000/host`
- `http://localhost:3000/screen`
- `http://localhost:3000/join`

If `HOST_PIN` is omitted, development PIN `1212` is used. Set your own PIN in production.

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

`correctOption` is zero-based.

## Environment

- `PORT` — server port, default 3000.
- `PUBLIC_URL` — public base URL used for QR links.
- `HOST_PIN` — PIN for the host panel.

## Deployment note

This JSON-only persistence model requires a persistent writable filesystem. Do not deploy it to an ephemeral/serverless runtime unless the state file is mounted on persistent storage.
