# Secure Notes — Backend

Express + MongoDB/Mongoose REST API (JWT auth, role-based access). The frontend lives in a separate repo (`secure-notes-frontend`).

## Run
```
cp .env.example .env     # set MONGO_URI, JWT_SECRET, CORS_ORIGIN, optionally ADMIN_EMAIL / ADMIN_PASSWORD
npm install
npm start                # http://localhost:3000  (health check: /health)
```

## Deploy (Render free tier + MongoDB Atlas free tier)
1. Create a free MongoDB Atlas cluster, a DB user, and allow network access `0.0.0.0/0` (Render free IPs are dynamic). Copy the connection string into `MONGO_URI`.
2. Push this repo to GitHub. In Render: **New → Web Service** → pick the repo (or use the included `render.yaml` Blueprint).
   Build: `npm install`, Start: `npm start`.
3. Set env vars: `MONGO_URI`, `JWT_SECRET` (long random), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `CORS_ORIGIN` = your deployed frontend URL(s), e.g. `https://my-notes.vercel.app` (no trailing slash; comma-separate multiple).
4. The free instance sleeps after inactivity; the first request can take ~30-60s. Hit `/health` before the interview.

An admin is seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD` if it doesn't exist. Public registration always creates role `user`.

## Security
- Passwords: bcrypt (cost 12), `passwordHash` is `select:false` and stripped from JSON; 8–72 char policy.
- JWT (HS256 pinned on verify, 1h expiry). Middleware re-loads the user by `_id` on every request, so deleted users / role changes apply immediately.
- Login uses a constant-time-ish dummy compare (no user enumeration by timing), generic error message, rate-limited `/api/auth`.
- Body fields are whitelisted (no mass assignment of `role`/`owner`); ids validated; helmet; 100kb body limit.
- Users can only update/delete their own notes. Admins can additionally *view* all notes (they cannot edit others' notes, per the spec).

## API
| Method | Path | Access |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | public |
| GET/PATCH | /api/users/me | any user |
| GET/POST | /api/users | admin (list paginated / create) |
| GET/PATCH/DELETE | /api/users/:id | admin |
| GET | /api/users/by-interests[?interest=x] | admin (Scenario 1) |
| GET/POST | /api/notes (`?scope=all&owner=` admin) | user (own) / admin (all) |
| GET/PATCH/DELETE | /api/notes/:id | owner (GET also admin) |
| POST/DELETE | /api/posts, /api/posts/:id | author |
| GET | /api/posts/user/:id | public (Scenario 2) |

All lists take `?page=&limit=` (limit capped at 100) and return `{data, page, limit, total, pages}`.

## Indexes (all declared with `schema.index`) — 4 custom indexes total
| Collection | Index | Why |
|---|---|---|
| users | `{email:1}` unique | login lookup + uniqueness |
| users | `{interests:1}` (multikey) | `$match` stage of the group-by-interests aggregation |
| notes | `{owner:1, _id:-1}` | "my notes" list (equality + sort, no in-memory sort), admin filter by owner, ownership-checked update/delete |
| posts | `{author:1, _id:-1}` | the `$lookup` sub-pipeline (equality on author + sort/limit), cascade delete |

Deliberately **not** indexed: 
- `GET` by id (users/notes/posts) and the admin "list all users"/"list all notes" views → they sort by `_id`, so the default `_id` index serves them. (Pagination sorts on `_id`, which is creation-ordered, instead of `createdAt`, so no extra `createdAt` indexes are needed.)
- `role`, `createdAt`, `title`: no query filters on them.

## Aggregations
1. **Group by interests** — `User.aggregate([...])` called exactly once: `$match` (optional, indexed) → `$unwind` → `$group` → `$sort` → `$facet` (page + total). Without the `?interest=` filter, grouping *every* user inevitably scans the collection; no index can avoid that, which is why the index is only used when filtering.
2. **User posts** — one pipeline on `users`: `$match {_id}` → `$lookup` with a sub-pipeline (`$match $expr $eq author`, `$sort`, `$skip`, `$limit`) so the lookup is paginated and hits `{author, _id}`.
