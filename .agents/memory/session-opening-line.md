---
name: Session opening line — variable hoisting pitfall
description: useEffect referencing currentCard which is a const declared later in the same function scope; must declare before the effect.
---

## Rule
`const currentCard = cardQueue[currentQueueIndex]` must be declared **before** any `useEffect` that references `currentCard?.card?.cardId` in its dependency array or body.

**Why:** React function components execute top-to-bottom. Even though `useEffect` runs after render, ESLint and the JS engine enforce temporal dead zone — referencing a `const` before its declaration throws `ReferenceError: Cannot access 'currentCard' before initialization`.

**How to apply:** In session.tsx or any component that derives a value from state and then uses it in a subsequent effect, declare the derived const first, then define the effect below it.

## Opening line pattern
- Endpoint: `POST /api/session/opening` with `{ cardId, profileId }`
- Returns `{ openingLine }` — 1–2 sentence realistic opener from the interlocutor
- Frontend: `openingFetchedRef` (useRef) tracks `${currentQueueIndex}:${cardId}` key to prevent duplicate fetches across re-renders
- Result is added as `{ role: "interlocutor", content: openingLine }` to `convoHistory` if history is empty
- Shows "Mise en situation…" spinner while fetching
