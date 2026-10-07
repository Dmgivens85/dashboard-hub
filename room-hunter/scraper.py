"""
NYC Room Hunter — scraper.py
Pulls listings from SpareRoom, Craigslist, Roomies, StreetEasy, and Zumper.
Scores them, deduplicates, and writes results to seen_listings.json + latest_report.md

Run:  python scraper.py
      python scraper.py --email   # also sends email digest
"""

import argparse
import hashlib
import json
import re
import time
import urllib.request
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup

from config import (
    CRITERIA, SPAREROOM_URLS, CRAIGSLIST_URLS, ROOMIES_URL,
    STREETEASY_URLS, ZUMPER_URLS,
    BOOST_KEYWORDS, PENALTY_KEYWORDS, SCORE_THRESHOLD,
)
from scorer import score_listing
from notifier import send_email_digest

SEEN_FILE = Path("seen_listings.json")
REPORT_FILE = Path("latest_report.md")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


# ── Helpers ────────────────────────────────────────────────────────────────

def fetch(url: str, retries: int = 3, delay: float = 2.0) -> str | None:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as exc:
            print(f"  [fetch] attempt {attempt+1} failed: {exc}")
            if attempt < retries - 1:
                time.sleep(delay)
    return None


def listing_id(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:12]


def load_seen() -> dict:
    if SEEN_FILE.exists():
        return json.loads(SEEN_FILE.read_text())
    return {}


def save_seen(seen: dict):
    SEEN_FILE.write_text(json.dumps(seen, indent=2))


def parse_price(text: str) -> int | None:
    m = re.search(r"\$\s*([\d,]+)", text)
    return int(m.group(1).replace(",", "")) if m else None


# ── SpareRoom ──────────────────────────────────────────────────────────────

def scrape_spareroom(url: str) -> list[dict]:
    print(f"  SpareRoom: {url[:80]}…")
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    listings = []

    selectors = [
        "article.listing-result",
        "li.listing-result",
        "div.listing-result",
        "div.listing",
    ]
    cards = []
    for sel in selectors:
        cards = soup.select(sel)
        if cards:
            break

    for card in cards:
        try:
            title_el = card.select_one("h3, h2, .listing__title, .listing-title")
            title = title_el.get_text(strip=True) if title_el else "No title"

            link_el = card.select_one("a[href]")
            href = link_el["href"] if link_el else ""
            if href.startswith("/"):
                href = "https://www.spareroom.com" + href
            if not href:
                continue

            price_text = card.get_text(" ", strip=True)
            price = parse_price(price_text)

            area_el = card.select_one("[class*='location'], [class*='area']")
            area = area_el.get_text(strip=True) if area_el else ""

            desc_el = card.select_one("[class*='description'], p")
            desc = desc_el.get_text(strip=True) if desc_el else ""

            listings.append({
                "source": "spareroom",
                "listing_type": "room",
                "title": title,
                "url": href,
                "price": price,
                "area": area,
                "description": desc,
                "raw": card.get_text(" ", strip=True)[:600],
            })
        except Exception as e:
            print(f"    [parse] skipped card: {e}")

    print(f"    → {len(listings)} listings")
    return listings


# ── Craigslist ─────────────────────────────────────────────────────────────

def scrape_craigslist(url: str) -> list[dict]:
    clean_url = url.split("#")[0]
    print(f"  Craigslist: {clean_url[:80]}…")
    html = fetch(clean_url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    listings = []

    for item in soup.select("li.cl-static-search-result, li.result-row"):
        try:
            title_el = item.select_one("a.posting-title, a.result-title, .title")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            href = title_el.get("href", "")
            if not href.startswith("http"):
                href = "https://newyork.craigslist.org" + href

            price_text = item.get_text(" ", strip=True)
            price = parse_price(price_text)

            area_el = item.select_one(".location, .result-hood, [class*='hood']")
            area = area_el.get_text(strip=True).strip("() ") if area_el else ""

            listings.append({
                "source": "craigslist",
                "listing_type": "room",
                "title": title,
                "url": href,
                "price": price,
                "area": area,
                "description": "",
                "raw": item.get_text(" ", strip=True)[:600],
            })
        except Exception as e:
            print(f"    [parse] skipped item: {e}")

    print(f"    → {len(listings)} listings")
    return listings


# ── Roomies ────────────────────────────────────────────────────────────────

def scrape_roomies() -> list[dict]:
    print(f"  Roomies: {ROOMIES_URL[:80]}…")
    html = fetch(ROOMIES_URL)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    listings = []

    for card in soup.select("[class*='listing'], [class*='room-card'], article"):
        try:
            title_el = card.select_one("h2, h3, [class*='title']")
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue
            link_el = card.select_one("a[href]")
            href = link_el["href"] if link_el else ""
            if href.startswith("/"):
                href = "https://www.roomies.com" + href
            if not href:
                continue

            price_text = card.get_text(" ", strip=True)
            price = parse_price(price_text)

            listings.append({
                "source": "roomies",
                "listing_type": "room",
                "title": title,
                "url": href,
                "price": price,
                "area": "",
                "description": card.get_text(" ", strip=True)[:300],
                "raw": card.get_text(" ", strip=True)[:600],
            })
        except Exception as e:
            print(f"    [parse] skipped card: {e}")

    print(f"    → {len(listings)} listings")
    return listings


# ── StreetEasy ─────────────────────────────────────────────────────────────

def scrape_streeteasy(url: str) -> list[dict]:
    print(f"  StreetEasy: {url[:80]}…")
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    listings = []

    # StreetEasy renders some data in JSON script tags
    for script in soup.select("script[type='application/json'], script#__NEXT_DATA__"):
        try:
            data = json.loads(script.string or "")
            # Try to find listings array in various JSON shapes
            units = (
                data.get("props", {}).get("pageProps", {}).get("listings", [])
                or data.get("listings", [])
                or data.get("units", [])
            )
            for unit in units:
                if not isinstance(unit, dict):
                    continue
                price = unit.get("price") or unit.get("rent") or unit.get("listingPrice")
                title = unit.get("title") or unit.get("name") or unit.get("address", "")
                href = unit.get("url") or unit.get("link") or ""
                if href and not href.startswith("http"):
                    href = "https://streeteasy.com" + href
                area = unit.get("neighborhood") or unit.get("area") or ""
                desc = unit.get("description") or unit.get("details") or ""

                if price and int(str(price).replace(",", "").replace("$", "")) > 1500:
                    continue  # solo unicorn threshold

                listings.append({
                    "source": "streeteasy",
                    "listing_type": "solo",
                    "title": title,
                    "url": href,
                    "price": int(str(price).replace(",", "").replace("$", "")) if price else None,
                    "area": area,
                    "description": str(desc)[:300],
                    "raw": str(unit)[:600],
                })
        except Exception:
            pass

    # Fallback: HTML card parsing
    if not listings:
        for card in soup.select(
            "[data-testid='listing-card'], "
            ".listing-card, "
            "article[class*='listing'], "
            "li[class*='listing']"
        ):
            try:
                title_el = card.select_one("h2, h3, [class*='title'], [class*='address']")
                title = title_el.get_text(strip=True) if title_el else ""
                if not title:
                    continue

                link_el = card.select_one("a[href]")
                href = link_el["href"] if link_el else ""
                if href.startswith("/"):
                    href = "https://streeteasy.com" + href

                price_text = card.get_text(" ", strip=True)
                price = parse_price(price_text)

                # Solo unicorn threshold — skip if over $1,500
                if price and price > 1500:
                    continue

                area_el = card.select_one("[class*='neighborhood'], [class*='area'], [class*='location']")
                area = area_el.get_text(strip=True) if area_el else ""

                listings.append({
                    "source": "streeteasy",
                    "listing_type": "solo",
                    "title": title,
                    "url": href,
                    "price": price,
                    "area": area,
                    "description": "",
                    "raw": card.get_text(" ", strip=True)[:600],
                })
            except Exception as e:
                print(f"    [parse] skipped card: {e}")

    print(f"    → {len(listings)} listings (unicorn filter: ≤$1,500)")
    return listings


# ── Zumper ─────────────────────────────────────────────────────────────────

def scrape_zumper(url: str) -> list[dict]:
    print(f"  Zumper: {url[:80]}…")
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    listings = []

    for card in soup.select(
        "[data-testid='listing-card'], "
        "[class*='listing-card'], "
        "[class*='ListingCard'], "
        "article"
    ):
        try:
            title_el = card.select_one("h2, h3, [class*='title'], [class*='address']")
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue

            link_el = card.select_one("a[href]")
            href = link_el["href"] if link_el else ""
            if href.startswith("/"):
                href = "https://www.zumper.com" + href

            price_text = card.get_text(" ", strip=True)
            price = parse_price(price_text)

            # Solo unicorn threshold
            if price and price > 1500:
                continue

            area_el = card.select_one("[class*='neighborhood'], [class*='location'], [class*='area']")
            area = area_el.get_text(strip=True) if area_el else ""

            # Detect room shares vs solo
            text_lower = card.get_text(" ", strip=True).lower()
            listing_type = "room" if any(
                w in text_lower for w in ["room", "share", "roommate", "housemate"]
            ) else "solo"

            listings.append({
                "source": "zumper",
                "listing_type": listing_type,
                "title": title,
                "url": href,
                "price": price,
                "area": area,
                "description": "",
                "raw": card.get_text(" ", strip=True)[:600],
            })
        except Exception as e:
            print(f"    [parse] skipped card: {e}")

    print(f"    → {len(listings)} listings")
    return listings


# ── Main ───────────────────────────────────────────────────────────────────

def run(send_email: bool = False):
    print(f"\n{'='*60}")
    print(f"NYC Room Hunter — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}\n")

    seen = load_seen()
    all_listings: list[dict] = []

    for url in SPAREROOM_URLS:
        all_listings.extend(scrape_spareroom(url))
        time.sleep(1.5)

    for url in CRAIGSLIST_URLS:
        all_listings.extend(scrape_craigslist(url))
        time.sleep(1.5)

    all_listings.extend(scrape_roomies())
    time.sleep(1.5)

    for url in STREETEASY_URLS:
        all_listings.extend(scrape_streeteasy(url))
        time.sleep(2.0)

    for url in ZUMPER_URLS:
        all_listings.extend(scrape_zumper(url))
        time.sleep(1.5)

    # Score, filter new only
    new_hits = []
    for listing in all_listings:
        lid = listing_id(listing["url"])
        if lid in seen:
            continue

        listing["score"] = score_listing(listing, CRITERIA, BOOST_KEYWORDS, PENALTY_KEYWORDS)
        if listing["score"] >= SCORE_THRESHOLD:
            new_hits.append(listing)
            seen[lid] = {
                "url": listing["url"],
                "title": listing["title"],
                "score": listing["score"],
                "type": listing.get("listing_type", "room"),
                "seen_at": datetime.now().isoformat(),
            }

    new_hits.sort(key=lambda x: x["score"], reverse=True)

    print(f"\n{'─'*60}")
    print(f"New listings passing threshold ({SCORE_THRESHOLD}): {len(new_hits)}")

    # Separate room shares from unicorns in report
    rooms = [l for l in new_hits if l.get("listing_type") != "solo"]
    unicorns = [l for l in new_hits if l.get("listing_type") == "solo"]

    report_lines = [
        "# NYC Room Hunter Report",
        f"_Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n",
        f"**Room shares:** {len(rooms)} new · **Unicorn solos:** {len(unicorns)} new\n",
        "---\n",
    ]

    def _listing_block(l: dict, idx: int) -> list[str]:
        price_str = f"${l['price']}/mo" if l.get("price") else "price unknown"
        area_str = f" · {l['area']}" if l.get("area") else ""
        tag = "🦄 UNICORN" if l.get("listing_type") == "solo" else ""
        return [
            f"## {idx}. {tag} {l['title']}".strip(),
            f"**Score:** {l['score']}/100 · **{price_str}**{area_str} · *{l['source']}*",
            f"[View listing]({l['url']})\n",
            f"{l.get('description', '')[:300]}\n",
            "---\n",
        ]

    if rooms:
        report_lines.append("## 🛏 Room Shares\n")
        for i, l in enumerate(rooms, 1):
            report_lines.extend(_listing_block(l, i))

    if unicorns:
        report_lines.append("## 🦄 Unicorn Solo Listings (≤$1,500)\n")
        for i, l in enumerate(unicorns, 1):
            report_lines.extend(_listing_block(l, i))

    if not new_hits:
        report_lines.append("_No new listings this run._\n")

    REPORT_FILE.write_text("\n".join(report_lines))
    print(f"Report → {REPORT_FILE}")

    save_seen(seen)
    print(f"Seen list → {SEEN_FILE} ({len(seen)} total)\n")

    if send_email and new_hits and CRITERIA.get("notify_email"):
        send_email_digest(new_hits, CRITERIA["notify_email"])

    return new_hits


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NYC Room Hunter")
    parser.add_argument("--email", action="store_true", help="Send email digest")
    args = parser.parse_args()
    run(send_email=args.email)
