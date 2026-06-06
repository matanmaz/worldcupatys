# World Cup @ YS — Deployment Setup

This site is a static `index.html` plus a Cloudflare **Pages Function** that stores
votes in **Workers KV**. No separate Worker deploy is needed — Pages bundles it.

## File layout

```
/
├── index.html
└── functions/
    └── api/
        └── [[route]].js
```

(That double-bracket folder name is literal — it's a Pages catch-all route.)

## One-time Cloudflare setup

### 1. Create a KV namespace

Cloudflare Dashboard → **Workers & Pages** → **KV** → **Create a namespace**
Name it something like `world-cup-ys-votes`. Copy the namespace ID.

### 2. Create the Pages project

- Dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
  (or connect a Git repo).
- Upload the project folder (or push it). No build command needed.

### 3. Bind KV to the Pages project

Pages project → **Settings** → **Functions** → **KV namespace bindings** → **Add binding**

| Variable name | KV namespace |
|---|---|
| `VOTES` | (select the namespace you created) |

Do this for **both** Production and Preview environments.

### 4. Set the admin key

Pages project → **Settings** → **Environment variables** → **Add variable**

| Variable name | Value | Type |
|---|---|---|
| `ADMIN_KEY` | (any long random string — this is your password) | Encrypted |

Save and redeploy.

## Using the admin view

Visit:
```
https://your-site.pages.dev/#admin
```
You'll be prompted for the admin key. It is stored in `sessionStorage` only,
so closing the tab clears it.

The admin view shows:
- Total voters and total votes cast
- A leaderboard of matches sorted by votes
- A list of every voter and what they spent points on

## Local development

```bash
npm install -g wrangler
wrangler pages dev . --kv VOTES
```

This gives you a local server with a local KV stub at `http://localhost:8788`.

## Activating the volunteer email form

The volunteer form on the site POSTs to [FormSubmit.co](https://formsubmit.co/)
targeting `mazursky@gmail.com`. The very first submission triggers a one-time
confirmation email to that address — click the link inside it once, and the form
is live forever after.

## Notes on the voting system

- Honor system: anyone can enter any name and get 10 points. Clearing browser
  data doesn't reset the budget — the budget is tracked **server-side** keyed
  by normalized (lowercased, trimmed) name.
- This means two people with the same first name will share a budget. For a
  Yellow Springs–scale community event, that's fine; the UI nudges people to
  use a recognizable name.
- KV is eventually consistent. In practice a vote shows up globally within a
  second or two. There's a small race-condition window if two votes hit the
  same match at the same millisecond — at this scale it's a non-issue.
