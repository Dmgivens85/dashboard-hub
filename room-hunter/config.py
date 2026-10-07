# NYC Room Hunter — Search Configuration
# Edit these values to adjust your criteria

CRITERIA = {
    # Budget (room shares)
    "min_rent": 800,
    "max_rent": 1700,
    "target_rent_low": 950,
    "target_rent_high": 1100,

    # Solo "unicorn" ceiling — only surfaces deals at or under this
    "solo_max_rent": 1500,

    # Move-in
    "move_in_target": "2026-11-01",

    # Geography — allowed neighborhoods/boroughs
    # Manhattan 110th–154th St corridor is primary
    "preferred_areas": [
        "harlem", "east harlem", "west harlem", "morningside heights",
        "hamilton heights", "sugar hill",
        "upper manhattan", "central harlem",
        # Brooklyn A/C line
        "bed-stuy", "bedford-stuyvesant", "crown heights", "flatbush",
        "prospect heights",
    ],
    "hard_no_areas": [
        "inwood", "upper washington heights", "dyckman",
    ],
    # Northern cutoff (Manhattan street number)
    "max_street_number": 154,

    # Household (used in scoring, not a hard filter)
    "lgbtq_required": True,
    "gender_preference": "male",
    "max_roommates": 3,

    # Email notification (set to None to skip)
    "notify_email": "givens85@gmail.com",
}

# ── SpareRoom ──────────────────────────────────────────────────────────────
SPAREROOM_URLS = [
    (
        "https://www.spareroom.com/rooms-for-rent/manhattan/manhattan"
        "?min_rent=800&max_rent=1700&rooms_for=males&lgbtq_friendly=1"
        "&available_from=01+Nov+2026&sort_by=updated_desc"
    ),
    (
        "https://www.spareroom.com/rooms-for-rent/new-york/brooklyn"
        "?min_rent=800&max_rent=1700&rooms_for=males&lgbtq_friendly=1"
        "&available_from=01+Nov+2026&sort_by=updated_desc"
    ),
    (
        "https://www.spareroom.com/rooms-for-rent/new-york/queens"
        "?min_rent=800&max_rent=1700&rooms_for=males&lgbtq_friendly=1"
        "&available_from=01+Nov+2026&sort_by=updated_desc"
    ),
]

# ── Craigslist ─────────────────────────────────────────────────────────────
CRAIGSLIST_URLS = [
    # Manhattan rooms
    (
        "https://newyork.craigslist.org/search/mnh/roo"
        "?min_price=800&max_price=1700&private_room=1#search=1~list~0~0"
    ),
    # Brooklyn rooms
    (
        "https://newyork.craigslist.org/search/brk/roo"
        "?min_price=800&max_price=1700&private_room=1#search=1~list~0~0"
    ),
    # Queens rooms
    (
        "https://newyork.craigslist.org/search/que/roo"
        "?min_price=800&max_price=1700&private_room=1#search=1~list~0~0"
    ),
]

# ── Roomies ────────────────────────────────────────────────────────────────
ROOMIES_URL = "https://www.roomies.com/rooms/new-york-ny"

# ── StreetEasy — solo unicorns only (≤$1,500) ─────────────────────────────
# Studios and 1BRs in the target neighborhoods, no-fee preferred
STREETEASY_URLS = [
    # Harlem / Upper Manhattan studios
    (
        "https://streeteasy.com/for-rent/nyc/harlem"
        "?bedrooms=0,1&price=-1500&no_fee=1"
    ),
    (
        "https://streeteasy.com/for-rent/nyc/east-harlem"
        "?bedrooms=0,1&price=-1500&no_fee=1"
    ),
    (
        "https://streeteasy.com/for-rent/nyc/west-harlem"
        "?bedrooms=0,1&price=-1500&no_fee=1"
    ),
    (
        "https://streeteasy.com/for-rent/nyc/morningside-heights"
        "?bedrooms=0,1&price=-1500&no_fee=1"
    ),
    # Brooklyn A/C corridor
    (
        "https://streeteasy.com/for-rent/nyc/bedford-stuyvesant"
        "?bedrooms=0,1&price=-1500&no_fee=1"
    ),
    (
        "https://streeteasy.com/for-rent/nyc/crown-heights"
        "?bedrooms=0,1&price=-1500&no_fee=1"
    ),
    (
        "https://streeteasy.com/for-rent/nyc/flatbush"
        "?bedrooms=0,1&price=-1500&no_fee=1"
    ),
]

# ── Zumper — room shares + solo unicorns ──────────────────────────────────
ZUMPER_URLS = [
    # Room shares
    "https://www.zumper.com/rooms-for-rent/new-york-city-ny",
    # Solo cheap
    (
        "https://www.zumper.com/apartments-for-rent/new-york-city-ny"
        "?max_price=1500&min_bedrooms=0&max_bedrooms=1"
    ),
]

# ── Keyword signals ────────────────────────────────────────────────────────
BOOST_KEYWORDS = [
    "gay", "queer", "lgbtq", "lgbt", "lgbtqia",
    "gay-friendly", "gay friendly", "pride",
    "men only", "men's apartment", "males only",
    "in-unit laundry", "in unit laundry", "w/d in unit",
    "elevator", "doorman",
    "no broker fee", "no fee", "owner direct",
    "rent stabilized", "rent-stabilized",
    "near subway", "steps from subway", "subway nearby",
    "professionals", "working professional",
]

PENALTY_KEYWORDS = [
    "female only", "women only", "ladies only", "girls only", "no males",
    "couples only",
    "155th", "156th", "157th", "158th", "159th", "160th",
    "inwood", "dyckman",
    "broker fee required", "one month fee",
]

# Minimum score to include in report (0–100)
SCORE_THRESHOLD = 45
