import hashlib
import json
import os
import time
import urllib.request
import uuid

import boto3

SOURCE_CHECKS = boto3.resource("dynamodb").Table(os.environ["SOURCE_CHECKS_TABLE"])
RUNS = boto3.resource("dynamodb").Table(os.environ["RUNS_TABLE"])

SOURCES = [
    ("ftc-consumer-alerts", "Federal Trade Commission", "https://consumer.ftc.gov/consumer-alerts", 1),
    ("fbi-ic3-psa", "FBI Internet Crime Complaint Center", "https://www.ic3.gov/PSA", 1),
    ("uspis-scam-articles", "U.S. Postal Inspection Service", "https://www.uspis.gov/news?filters=scam-article", 1),
    ("cisa-alerts", "Cybersecurity and Infrastructure Security Agency", "https://www.cisa.gov/news-events/cybersecurity-advisories", 1),
    ("irs-tax-scams", "Internal Revenue Service", "https://www.irs.gov/newsroom/tax-scams-consumer-alerts", 1),
    ("ssa-oig-scam-alerts", "Social Security Administration OIG", "https://oig.ssa.gov/scam-awareness/scam-alert/", 1),
    ("hhs-oig-fraud-alerts", "HHS Office of Inspector General", "https://oig.hhs.gov/fraud/consumer-alerts/", 1),
    ("sec-investor-alerts", "U.S. Securities and Exchange Commission", "https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-alerts", 1),
    ("cfpb-consumer-advisories", "Consumer Financial Protection Bureau", "https://www.consumerfinance.gov/consumer-tools/fraud/", 1),
    ("va-ag-consumer-alerts", "Office of the Attorney General of Virginia", "https://www.oag.state.va.us/consumer-protection/consumer-alerts", 2),
    ("ny-ag-consumer-alerts", "Office of the New York State Attorney General", "https://ag.ny.gov/resources/individuals/consumer-issues/scams", 2),
    ("ca-ag-consumer-alerts", "California Department of Justice", "https://oag.ca.gov/consumers/general/scams", 2),
]


def fetch(source):
    source_id, publisher, url, tier = source
    checked_at = int(time.time())
    request = urllib.request.Request(url, headers={"User-Agent": "ScoutlineSourceMonitor/1.0 (+https://github.com/Jrjoseph831/scoutline)"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read(2_000_000)
            content_type = response.headers.get("content-type", "")
            status = response.status
        digest = hashlib.sha256(body).hexdigest()
        item = {
            "source_id": source_id,
            "publisher": publisher,
            "url": url,
            "tier": tier,
            "checked_at": checked_at,
            "http_status": status,
            "content_type": content_type,
            "content_hash": digest,
            "fetch_state": "ok",
            "publication_state": "source-check-only",
        }
    except Exception as exc:
        item = {
            "source_id": source_id,
            "publisher": publisher,
            "url": url,
            "tier": tier,
            "checked_at": checked_at,
            "fetch_state": "error",
            "error": str(exc)[:500],
            "publication_state": "source-check-only",
        }
    SOURCE_CHECKS.put_item(Item=item)
    return item


def handler(event, context):
    run_id = str(uuid.uuid4())
    started_at = int(time.time())
    results = [fetch(source) for source in SOURCES]
    failures = [item for item in results if item["fetch_state"] != "ok"]
    RUNS.put_item(Item={
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": int(time.time()),
        "source_count": len(results),
        "failure_count": len(failures),
        "state": "partial" if failures else "succeeded",
        "expires_at": int(time.time()) + 7776000,
    })
    return {
        "statusCode": 200 if not failures else 207,
        "body": json.dumps({"runId": run_id, "checked": len(results), "failed": len(failures)}),
    }
