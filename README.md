# BeerFactory Game

Realtime team quiz for venue events.

## Core mechanics

- Teams are created dynamically by the host; there is no fixed team count.
- Each team has an editable display name and a stable join code.
- Any number of players can join a team.
- Players enter a display name and keep a persistent local player ID in the browser.
- Each team gets its own join URL / QR code.
- The host starts and closes rounds.
- Each player answers independently.
- Team round score is based on the percentage of correct answers among players who submitted an answer.
- If several teams have the same percentage, average response time is used as a tiebreaker.
- Winning team receives 1 point.
- Runtime state is kept in memory and persisted atomically to JSON. No database is required.

## Planned routes

- `/host` — host/admin panel
- `/screen` — projector/public screen
- `/join/:teamCode` — player join and gameplay
- `/api/*` — supporting HTTP endpoints

## Persistence

- `data/game-state.json` — current session state
- `data/questions.json` — question bank

The server writes state only on business events (team/player creation, answer submit, round state changes, score changes) and restores it on startup.
