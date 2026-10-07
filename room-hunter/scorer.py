"""
scorer.py — Listing scoring logic

Score range: 0–100
  - Budget fit:       0–30 pts
  - Geography:        0–25 pts
  - Household fit:    0–25 pts  (room shares only; solo listings skip this)
  - Keyword signals:  0–20 pts  (boosts/penalties from config)

Solo listings (StreetEasy / Zumper) use a separate unicorn scoring path.
"""

import re
from config import CRITERIA


# ── Helpers ────────────────────────────────────────────────────────────────

def _text(listing: dict) -> str:
    """Combine all text fields for keyword scanning."""
    return " ".join([
        listing.get("title", ""),
        listing.get("description", ""),
        listing.get("area", ""),
        listing.get("raw", ""),
    ]).lower()


def _street_number(area: str) -> int | None:
    """Try to extract a Manhattan street number from area string."""
    m = re.search(r"\b(\d{2,3})(st|nd|rd|th)?\s*(street|st\.?|ave|avenue)?\b", area, re.I)
    if m:
        return int(m.group(1))
    return None


def _price_score(price: int | None, min_r: int, target_low: int,
                 target_high: int, max_r: int) -> int:
    """Return 0–30 based on how well price fits the budget."""
    if price is None:
        return 10  # unknown — neutral, don't kill it
    if price < min_r or price > max_r:
        return 0
    if target_low <= price <= target_high:
        return 30
    if price < target_low:
        # Below target — great, but slightly unusual; still good
        return 25
    # Between target_high and max_r — sliding scale
    spread = max_r - target_high
    over = price - target_high
    return max(5, int(20 * (1 - over / spread)))


def _geo_score(listing: dict, hard_no_areas: list, preferred_areas: list,
               max_street: int) -> int:
    """Return 0–25 based on geography."""
    text = _text(listing)
    area = listing.get("area", "").lower()

    # Hard no — immediate disqualify
    for bad in hard_no_areas:
        if bad in text or bad in area:
            return 0

    # Check Manhattan street number ceiling
    street_num = _street_number(area) or _street_number(listing.get("title", ""))
    if street_num and street_num > max_street:
        return 0

    # Preferred area match
    for pref in preferred_areas:
        if pref in text or pref in area:
            return 25

    # Manhattan / Brooklyn / Queens generic
    if any(w in text for w in ["manhattan", "harlem", "uptown"]):
        return 18
    if any(w in text for w in ["brooklyn", "bed stuy", "crown heights", "flatbush"]):
        return 15
    if "queens" in text:
        return 8

    return 10  # unknown area — neutral


def _household_score(listing: dict) -> int:
    """Return 0–25 based on household compatibility signals."""
    text = _text(listing)
    score = 0

    # LGBTQ signals
    lgbtq_terms = ["gay", "queer", "lgbtq", "lgbt", "lgbtqia", "pride",
                   "gay-friendly", "gay friendly"]
    if any(t in text for t in lgbtq_terms):
        score += 15

    # Male household signals
    male_terms = ["men only", "males only", "men's apartment", "all male",
                  "male roommate", "male housemate", "guys only"]
    if any(t in text for t in male_terms):
        score += 10

    # Female-dominant penalty
    female_terms = ["female only", "women only", "ladies only", "girls only",
                    "all female", "women's apartment"]
    if any(t in text for t in female_terms):
        return 0

    # Age range signals (35–50 preferred)
    age_terms = ["30s", "40s", "thirties", "forties", "professionals",
                 "working professional", "late 30", "early 40"]
    if any(t in text for t in age_terms):
        score += 5

    return min(score, 25)


def _keyword_score(listing: dict, boosts: list, penalties: list) -> int:
    """Return -20 to +20 based on boost/penalty keywords."""
    text = _text(listing)
    score = 0
    for kw in boosts:
        if kw.lower() in text:
            score += 4
    for kw in penalties:
        if kw.lower() in text:
            score -= 6
    return max(-20, min(20, score))


# ── Main scoring entry point ───────────────────────────────────────────────

def score_listing(listing: dict, criteria: dict,
                  boost_keywords: list, penalty_keywords: list) -> int:
    """
    Score a listing 0–100. Solo listings (StreetEasy, Zumper) use
    unicorn_score() instead if flagged as listing_type='solo'.
    """
    if listing.get("listing_type") == "solo":
        return unicorn_score(listing, criteria)

    price = listing.get("price")

    budget = _price_score(
        price,
        criteria["min_rent"],
        criteria["target_rent_low"],
        criteria["target_rent_high"],
        criteria["max_rent"],
    )
    geo = _geo_score(
        listing,
        criteria["hard_no_areas"],
        criteria["preferred_areas"],
        criteria["max_street_number"],
    )
    household = _household_score(listing)
    keywords = _keyword_score(listing, boost_keywords, penalty_keywords)

    raw = budget + geo + household + keywords
    return max(0, min(100, raw))


def unicorn_score(listing: dict, criteria: dict) -> int:
    """
    Scoring path for solo listings (studio / 1BR).
    Threshold is stricter — only surface genuinely great deals.
    Unicorn criteria:
      - Price ≤ $1,500/mo
      - In preferred geography
      - No broker fee signals are a big plus
    """
    price = listing.get("price")
    text = _text(listing)

    # Hard price ceiling for solo
    if price is None:
        base = 20  # unknown — give it a chance
    elif price > 1500:
        return 0   # not a unicorn
    elif price <= 1200:
        base = 50
    elif price <= 1350:
        base = 40
    else:
        base = 30  # 1350–1500

    geo = _geo_score(
        listing,
        criteria["hard_no_areas"],
        criteria["preferred_areas"],
        criteria["max_street_number"],
    )

    # No broker fee bonus
    no_fee_bonus = 0
    if any(t in text for t in ["no fee", "no broker", "no broker fee", "owner direct"]):
        no_fee_bonus = 15

    # Rent stabilized bonus
    stabilized_bonus = 0
    if any(t in text for t in ["rent stabilized", "rent-stabilized", "rs unit"]):
        stabilized_bonus = 10

    raw = base + geo + no_fee_bonus + stabilized_bonus
    return max(0, min(100, raw))
