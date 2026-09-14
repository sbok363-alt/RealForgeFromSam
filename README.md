Forge

> An adaptive AI fitness coach for training with more intent and less guesswork.

Forge turns your goals, schedule, experience, equipment, and feedback into a training system that can adapt as real life changes.

## What Forge does

- **Forge Brain** — a clear read on readiness, recovery, and momentum.
- **Adaptive workouts** — sessions shaped around the time and equipment you actually have.
- **Training plans** — a longer-term structure with room to adjust.
- **Progress tracking** — see how consistency and performance build over time.
- **Proposals** — review and understand suggested changes to your training.
- **Audit logs** — keep a visible record of what changed and why.

## The idea

Most fitness apps give you more data. Forge is designed to give you a better next decision.

The system starts with your context, proposes a plan, listens to your feedback, and uses that signal to shape what comes next. A missed session is information—not a reason to start over.

## Product areas

Forge is organized around a small set of focused surfaces:

| Area | Purpose |
| --- | --- |
| Home | See the day’s focus and current training signal. |
| Workout | Follow the session and record how it felt. |
| Brain | Understand the reasoning behind your next move. |
| Plans | Build and review longer-term training structure. |
| Progress | Track meaningful change over time. |
| Proposals | Review adjustments before they shape the plan. |
| Audit logs | Keep the system’s decisions transparent. |

## Tech stack

- React + TypeScript
- Vite
- Firebase / Firestore
- Google GenAI
- React Router
- Tailwind CSS

## Getting started

### Prerequisites

- Node.js 18+
- npm or Bun
- A configured Firebase project

### Install

```bash
npm install
```

### Configure environment

Copy the example environment file and add the Firebase and AI configuration required for your local project:

```bash
cp .env.example .env
```

### Run locally

```bash
npm run dev
```

### Check the project

```bash
npm run lint
npm test
```

## Project structure

```text
src/
├── ai/           AI and reasoning flows
├── components/   Shared UI and auth components
├── domain/       Product and training logic
├── layouts/      App shells and navigation
├── pages/        Product surfaces
├── server/       Server-side mutations
├── store/        Client state
└── types/        Shared TypeScript types
```

## Status

Forge is an active work in progress. The goal is a fitness product that feels useful on an ordinary week—not only on a perfect one.

## Contributing

Ideas, issues, and thoughtful feedback are welcome. If you are proposing a change, include the user problem it solves and how it keeps the training experience clear and actionable.

## License

This project is currently being developed privately. Licensing details will be added when the project is ready for broader contribution.
