# UKPC BDM Agent — full setup (items 1, 2 and 3)

Three pieces. Item 2 is the quickest win — do it first while you're waiting on the API key for item 3.

---

## Item 1 — Projects (already done, 1 minute)

You're already working inside a Claude Project, and it remembers your pipeline: the nine Hertfordshire leads, the NERS LV-only constraint, the IDNO list, the tender portals and CPV codes.

**Your manual sweep button:** open this Project, type **"run my 11kV sweep"**, and Claude runs fresh research with all that context. Do it any time you want a deeper dive than the automated digest gives you.

---

## Item 2 — Free portal alerts (~15 minutes, no cost, works tonight)

These email you automatically when matching notices drop. Set all three.

**Contracts Finder** (contractsfinder.service.gov.uk)
1. Create a free account (Register).
2. Search with keyword `substation`, filter region to East of England / Eastern.
3. Save the search and turn on email notifications.
4. Repeat for keywords: `11kV`, `HV connection`, `high voltage`.

**Find a Tender** (find-tender.service.gov.uk)
1. Register free.
2. Create a saved search using CPV codes: **45315300** (electrical installation), **45231400** (power lines), **31200000** (switchgear/distribution apparatus), **71323100** (power systems design).
3. Enable daily email alerts.

**Supply Hertfordshire** (supplyhertfordshire.uk)
1. Register UK Power Connections Ltd as a supplier (free).
2. Select electrical/civil works categories — you'll be auto-notified of matching council tenders across all Herts districts.

*(Portal layouts change — if a menu name differs slightly, the saved-search + email-alert feature is what you're looking for on each.)*

---

## Item 3 — The twice-daily automated agent (~30–45 minutes)

What it does: at **07:30 and 16:30 UK time** every day, Claude searches the live web (tender portals, planning news, development press) for new 11kV/HV opportunities near St Albans and **emails you a digest**. It's instructed to only report what it actually finds, with links — and to say plainly when there's nothing new.

### Step A — Get your two API keys

1. **Anthropic API key:** go to **console.anthropic.com** → sign up → add billing → API Keys → Create key. Copy it somewhere safe. (This is separate from your Claude app subscription. Expect roughly £10–30/month at this usage — check current pricing at docs.claude.com.)
2. **Resend key (sends the emails):** go to **resend.com** → free account → API Keys → Create. The free tier is plenty. Until you verify your own domain, use `onboarding@resend.dev` as the sender.

### Step B — Deploy to Netlify

Easiest route (no command line):
1. Put this folder in a GitHub repo (github.com → New repository → upload these files), **or** zip-drop it via Netlify's manual deploy.
2. In **app.netlify.com** → Add new site → Import from Git → pick the repo. No build command needed; just deploy.
3. Go to **Site settings → Environment variables** and add these four:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com |
| `RESEND_API_KEY` | your key from resend.com |
| `DIGEST_TO` | your email address |
| `DIGEST_FROM` | `onboarding@resend.dev` (or your verified domain sender) |

4. Redeploy the site (Deploys → Trigger deploy) so the variables take effect.

### Step C — Test it now (don't wait for 07:30)

In Netlify: **Logs → Functions → bdm-sweep → Test run** (or trigger it from the Functions tab). Within a minute or two you should get the digest email. If not, the function log will show exactly which step failed — most commonly a mistyped env variable.

### Changing the schedule

Times are set in `netlify.toml` and in the function file as a cron string, currently `30 6,15 * * *` (UTC — that's 07:30/16:30 UK in summer, 06:30/15:30 in winter). Edit both places and redeploy. Example: `0 8,17 * * *` = 08:00 and 17:00 UTC.

---

## How the three pieces fit together

- **Portal alerts (Item 2)** catch official tenders the moment they publish — free, reliable, narrow.
- **The scheduled agent (Item 3)** casts wider twice a day — planning news, development press, pipeline movement — and lands in your inbox.
- **This Project (Item 1)** is where you bring anything interesting for a deep dive, qualification and outreach drafting, alongside your BDM tracker app.

## Honest caveats

- The agent reports what live search finds; **always verify references, values and deadlines** on the source portal before spending bid time.
- Your NERS scope on file is **LV-only** — the agent is instructed to flag leads where HV self-delivery needs a scope extension or jointing partner. Resolving that (extension or partner) is still your highest-leverage commercial move.
- API model names and pricing change; if the function ever errors with a model message, check docs.claude.com for the current model string and update one line in `bdm-sweep.mjs`.
