# NYC Room Hunter

Scrapes SpareRoom, Craigslist, Roomies, StreetEasy, and Zumper for rooms and (rarely) solo apartments matching your criteria. Runs free, no monthly services required.

## What it does

- **Room shares:** SpareRoom (LGBTQ+ filtered), Craigslist, Roomies, Zumper
- **Unicorn solos:** StreetEasy + Zumper studios/1BRs ≤$1,500/mo, no-fee preferred
- Scores each listing 0–100 against your geography, budget, and household fit
- Deduplicates across runs — only new listings surface each time
- Writes `latest_report.md` after each run
- Optional: emails a digest to yourself

## Setup

```bash
pip install -r requirements.txt
```

## Run

```bash
# Just generate the report
python scraper.py

# Generate report AND email yourself (requires env vars — see below)
python scraper.py --email
```

## Email setup (optional)

**Option A — Gmail app password (easiest)**
1. Enable 2FA on your Google account
2. Go to myaccount.google.com → Security → App Passwords → create one
3. Set env vars:
```bash
export GMAIL_USER="givens85@gmail.com"
export GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
```

**Option B — SendGrid (free tier: 100 emails/day)**
```bash
export SENDGRID_API_KEY="SG.xxxxxxxxxx"
```

## Automate it (runs every few hours)

**Mac/Linux cron** — add to crontab (`crontab -e`):
```
0 */4 * * * cd /path/to/nyc-room-hunter && python scraper.py --email >> run.log 2>&1
```

**GitHub Actions** (free, runs in the cloud):
See `.github/workflows/hunt.yml` — push the repo private and it'll run on schedule.

## Tune the criteria

Edit `config.py`:
- `CRITERIA` — budget, geography, move-in date
- `BOOST_KEYWORDS` / `PENALTY_KEYWORDS` — what raises or lowers scores
- `SCORE_THRESHOLD` — minimum score to appear in report (default 45/100)
- `STREETEASY_URLS` / `ZUMPER_URLS` — add/remove neighborhoods

## Output

- `latest_report.md` — this run's hits, sorted by score
- `seen_listings.json` — all listings ever surfaced (prevents re-alerting)

## Facebook groups (manual step)

The following groups require login and can't be scraped headlessly. Check them directly — they're high-signal:
- **Gay Roommates NYC** (9.2K members, public)
- **NYC Queer Housing (LGBTQ)** (14K members — you're joined)
- **NYC Queer POC Housing**
