This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Changes to the DB
Make after creating tables in schema.ts make sure to run
`pnpm drizzle-kit generate`
and then
`pnpm drizzle-kit push`

---

## Data Flow Architecture

This application syncs Hacker News items to a local PostgreSQL database and extracts trending keywords using ML-based analysis.

### Pipeline Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Hacker News    │────▶│   Sync System   │────▶│   PostgreSQL    │────▶│    Frontend     │
│  Firebase API   │     │  (lib/hn-api)   │     │   (Neon DB)     │     │   (Next.js)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘     └─────────────────┘
                                                         │                       ▲
                                                         ▼                       │
                                               ┌─────────────────┐               │
                                               │ Keyword Service │───────────────┘
                                               │  (Python/YAKE)  │
                                               └─────────────────┘
```

---

### 1. Items Sync Flow

Items are fetched from the [Hacker News Firebase API](https://github.com/HackerNews/API) and stored locally.

#### Data Sources
| HN API Endpoint | Purpose |
|-----------------|---------|
| `/v0/maxitem.json` | Latest item ID (used to detect new items) |
| `/v0/item/{id}.json` | Fetch individual item (story, comment, job, poll) |
| `/v0/user/{id}.json` | Fetch user profile |

#### Sync Process

2. **Incremental Sync** (`POST /api/sync/incremental`)
   - Detects gap between local max item ID and remote max
   - Creates sync run to fetch missing items

3. **Chunk Processing** (`POST /api/sync/chunk`)
   - Processes 1000 items per request
   - Batch fetches from HN API (20 concurrent requests)
   - Inserts users first (FK constraint), then items
   - Updates sync progress

4. **Cron Automation** (`GET /api/cron/sync`)
   - External cron triggers every 5 minutes
   - Processes 500 items per run (fits 60s timeout)
   - Auto-queues keyword extraction when sync completes

#### Items Database Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer (PK) | HN item ID |
| `type` | enum | `story`, `comment`, `job`, `poll`, `pollopt` |
| `by` | text (FK) | Author username → `users` table |
| `time` | integer | Unix timestamp |
| `title` | text | Story/job title |
| `text` | text | Body content (HTML) |
| `url` | text | External link |
| `score` | integer | Points/upvotes |
| `descendants` | integer | Comment count |

---

### 2. Keyword Extraction Flow

After items are synced, keywords are extracted using the YAKE algorithm.

#### YAKE Keyword Service

Located in `/keyword-service/`, this is a **FastAPI microservice** using [YAKE](https://github.com/LIAAD/yake) (Yet Another Keyword Extractor):

- **Unsupervised** - no training data required
- **Language-independent** - works with any language
- **Lower scores = more relevant** keywords

```bash
# Run the service
docker-compose up keyword-service
```

#### Extraction Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. QUEUE CREATION (after sync completes)                                   │
│     - Record added to `keywordExtractionQueue` with status: "pending"       │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. QUEUE PROCESSING (/api/keywords/process-queue)                          │
│     - Find pending/failed records                                           │
│     - Set status → "processing"                                             │
│     - Call extract-daily endpoint                                           │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. DAILY EXTRACTION (/api/keywords/extract-daily)                          │
│     For each unprocessed day:                                               │
│     a. Query items by date (stories + comments)                             │
│     b. Combine title + text, strip HTML                                     │
│     c. Send to YAKE service (max 250 keywords, 3-gram)                      │
│     d. Aggregate by root terms (e.g., "claude 3.5" → "claude")              │
│     e. Filter blacklisted words (common noise)                              │
│     f. Store top 75 keywords in `dailyKeywords`                             │
│     g. Update `keywordStats` (first/last seen, days appeared)               │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. TRENDS ANALYSIS (/api/keywords/trends)                                  │
│     - Compare daily ranks to identify rising/falling keywords               │
│     - Calculate weekly movers (top gainers/losers)                          │
│     - Identify new keywords appearing for the first time                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Root Term Aggregation

Similar keywords are grouped under **root terms** to reduce fragmentation:

```
"Claude 3.5", "claude sonnet", "Claude API"  →  "claude"
"rust programming", "rustlang"               →  "rust"
"GPT-4", "gpt 4o", "chatgpt"                 →  "gpt"
```

#### Blacklist Filtering

Common noise words are filtered out (`lib/keyword-blacklist.ts`):
- HN artifacts: `show`, `hn`, `ask`, `https`
- Generic words: `thing`, `stuff`, `people`, `work`
- Time words: `today`, `years`, `months`

---

### 3. API Endpoints Reference

#### Sync Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sync/incremental` | POST | Start incremental sync |
| `/api/sync/chunk` | POST | Process one chunk of items |
| `/api/sync/status` | GET | Current sync state & item count |
| `/api/sync/stream` | GET | SSE real-time progress |
| `/api/sync` | DELETE | Pause running sync |
| `/api/cron/sync` | GET | Cron-triggered sync + keyword queue |

#### Items Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/items/top` | GET | Top stories by score (params: `limit`, `hours`) |
| `/api/items/recent` | GET | Most recent items |

#### Keywords Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/keywords` | POST | Extract keywords from specific items |
| `/api/keywords/extract-daily` | POST | Process keywords day-by-day |
| `/api/keywords/process-queue` | POST | Process pending queue records |
| `/api/keywords/trends` | GET | Daily trends, gainers, losers |
| `/api/keywords/range` | GET | Min/max dates from items |
| `/api/keywords/status` | GET | Extraction status overview |
