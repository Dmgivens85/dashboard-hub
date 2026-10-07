"""
notifier.py — Email digest via Gmail SMTP or SendGrid

Configure one of:
  - SMTP (Gmail app password): set GMAIL_USER and GMAIL_APP_PASSWORD env vars
  - SendGrid: set SENDGRID_API_KEY env var

If neither is set, the email step is silently skipped and results
are only written to latest_report.md.
"""

import os
import smtplib
import json
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime


def _build_html(listings: list[dict]) -> str:
    rooms = [l for l in listings if l.get("listing_type") != "solo"]
    unicorns = [l for l in listings if l.get("listing_type") == "solo"]

    def card(l: dict) -> str:
        price_str = f"${l['price']}/mo" if l.get("price") else "price unknown"
        area_str = f" · {l['area']}" if l.get("area") else ""
        tag = "🦄 " if l.get("listing_type") == "solo" else ""
        return f"""
        <div style="border:1px solid #ddd;border-radius:6px;padding:12px;margin-bottom:12px;">
          <h3 style="margin:0 0 4px">{tag}{l['title']}</h3>
          <p style="margin:0;color:#555;font-size:13px;">
            Score: <strong>{l['score']}/100</strong> &nbsp;·&nbsp;
            <strong>{price_str}</strong>{area_str} &nbsp;·&nbsp;
            <em>{l['source']}</em>
          </p>
          {f'<p style="margin:8px 0 0;font-size:13px;">{l["description"][:200]}</p>' if l.get("description") else ""}
          <a href="{l['url']}" style="display:inline-block;margin-top:8px;color:#2563eb;">
            View listing →
          </a>
        </div>"""

    sections = []
    if rooms:
        sections.append("<h2>🛏 Room Shares</h2>")
        sections.extend(card(l) for l in rooms)
    if unicorns:
        sections.append("<h2>🦄 Unicorn Solo Listings (≤$1,500)</h2>")
        sections.extend(card(l) for l in unicorns)

    return f"""
    <html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;">
      <h1 style="color:#111;">NYC Room Hunter</h1>
      <p style="color:#555;">{datetime.now().strftime('%B %d, %Y %H:%M')} &nbsp;·&nbsp;
         {len(listings)} new listing{'s' if len(listings)!=1 else ''}</p>
      {''.join(sections)}
      <hr style="margin-top:24px;">
      <p style="font-size:11px;color:#999;">
        Sent by nyc-room-hunter · edit config.py to adjust criteria
      </p>
    </body></html>"""


def _plain_text(listings: list[dict]) -> str:
    lines = [f"NYC Room Hunter — {datetime.now().strftime('%Y-%m-%d %H:%M')}",
             f"{len(listings)} new listing(s)\n"]
    for l in listings:
        price_str = f"${l['price']}/mo" if l.get("price") else "price unknown"
        tag = "[UNICORN] " if l.get("listing_type") == "solo" else ""
        lines += [
            f"{tag}{l['title']}",
            f"Score: {l['score']}/100  |  {price_str}  |  {l['source']}",
            l["url"],
            "",
        ]
    return "\n".join(lines)


def send_via_smtp(listings: list[dict], to_email: str):
    user = os.environ.get("GMAIL_USER")
    password = os.environ.get("GMAIL_APP_PASSWORD")
    if not user or not password:
        print("  [email] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🏠 Room Hunter: {len(listings)} new listing{'s' if len(listings)!=1 else ''}"
    msg["From"] = user
    msg["To"] = to_email
    msg.attach(MIMEText(_plain_text(listings), "plain"))
    msg.attach(MIMEText(_build_html(listings), "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(user, password)
            server.sendmail(user, to_email, msg.as_string())
        print(f"  [email] Sent to {to_email} via Gmail SMTP")
    except Exception as e:
        print(f"  [email] SMTP failed: {e}")


def send_via_sendgrid(listings: list[dict], to_email: str):
    api_key = os.environ.get("SENDGRID_API_KEY")
    if not api_key:
        return False

    payload = json.dumps({
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": to_email},
        "subject": f"🏠 Room Hunter: {len(listings)} new listing{'s' if len(listings)!=1 else ''}",
        "content": [
            {"type": "text/plain", "value": _plain_text(listings)},
            {"type": "text/html", "value": _build_html(listings)},
        ],
    }).encode()

    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"  [email] Sent via SendGrid (status {resp.status})")
        return True
    except Exception as e:
        print(f"  [email] SendGrid failed: {e}")
        return False


def send_email_digest(listings: list[dict], to_email: str):
    """Try SendGrid first (no auth setup needed), fall back to Gmail SMTP."""
    if not listings:
        return
    if not send_via_sendgrid(listings, to_email):
        send_via_smtp(listings, to_email)
