# Forbidden Lands — The Ravenland Chronicles

A Phase 1 interface prototype for an AI Game Master and four human adventurers. All campaign text is original mock content. No sourcebook text, official artwork, or external fonts are included.

## Run locally

Requires Node.js 20.9+ (Node 24 recommended) and npm.

```sh
cd ravenland
npm ci
npm run dev
```

Open **http://localhost:3000** in your browser. For a production build use `npm run build` followed by `npm start`. If port 3000 is occupied, use `npm run dev -- --port 3001` and open that port instead.

## Try the prototype

- Read the sample encounter and switch between four local player identities in the composer.
- Submit an action with Enter (Shift+Enter inserts a newline). The mock GM branches on wagon/forest-related keywords; it is intentionally deterministic and does not use an AI model.
- Open Map, Dice Roller, Characters, Journal, or Campaign Settings from the top navigation.
- Roll positive or negative skill pools, add journal entries, or change the campaign title, objective, and quarter day. Settings and notes update immediately within this tab.
- On mobile, open campaign status using the menu button. Tool panels support Escape and keyboard focus containment.

**Local state only:** refresh resets the demo. Party members are mock profiles, not connected users. There is no multiplayer, invite link, authentication, database, paid API, or external communication. Voice is not integrated; Discord can be used separately. Spell/character management from the earlier standalone sheet is not integrated in this prototype.

## Architecture

- `src/app`: Next.js App Router entry point and Tailwind/CSS styling.
- `src/components`: campaign shell, status sidebar, and companion tool panels.
- `src/lib/types.ts`: shared domain models and GameMaster boundary.
- `src/lib/mock.ts`: original seed encounter and local mock GM adapter.
- `src/lib/session.ts`: immutable session reducer and dice engine.

A future server transport can dispatch shared session events instead of local reducer actions. Persistent storage should sit behind a server repository, and any OpenAI adapter must run on the server with a private environment key. No API credentials are needed or read now. This prototype makes no synchronization or persistence guarantees.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Browser smoke checks use the environment-provided Playwright and Chromium: start the app, then run `node tests/browser.cjs`. Set `BASE_URL` or `CHROMIUM_PATH` if needed. These checks exercise action/reply flow, journal creation, settings, dice, tool panels, and a mobile viewport.

The existing root `index.html` character sheet is preserved and remains independently runnable.
