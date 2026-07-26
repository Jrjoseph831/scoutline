import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

SCAMS = boto3.resource("dynamodb").Table(os.environ["SCAMS_TABLE"])
EVIDENCE = boto3.resource("dynamodb").Table(os.environ["EVIDENCE_TABLE"])


def serializable(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError


def qualifying_evidence(scam_id):
    response = EVIDENCE.query(KeyConditionExpression=Key("scam_id").eq(scam_id), Limit=20)
    return [
        item for item in response.get("Items", [])
        if item.get("source_url", "").startswith("https://")
        and item.get("publisher")
        and item.get("source_published_at")
        and int(item.get("source_tier", 99)) <= 2
    ]


def handler(event, context):
    path = event.get("rawPath", "/scams")
    if path.endswith("/health"):
        return response(200, {"status": "ok", "service": "scoutline-public-api"})

    params = event.get("queryStringParameters") or {}
    query = SCAMS.query(
        IndexName="publication-date-index",
        KeyConditionExpression=Key("publication_state").eq("published"),
        ScanIndexForward=False,
        Limit=50,
    )
    search = (params.get("q") or "").strip().lower()
    state = (params.get("state") or "").strip().upper()
    postal_code = (params.get("zip") or "").strip()
    output = []
    for item in query.get("Items", []):
        evidence = qualifying_evidence(item["scam_id"])
        if not evidence:
            continue
        if search and search not in " ".join([item.get("title", ""), item.get("summary", ""), item.get("category", "")]).lower():
            continue
        scope = item.get("scope", "national")
        if scope != "national" and state and item.get("state") != state:
            continue
        if scope == "postal" and postal_code and postal_code not in item.get("postal_codes", []):
            continue
        public_item = {key: value for key, value in item.items() if key not in {"internal_notes", "raw_content"}}
        public_item["sources"] = evidence
        output.append(public_item)

    return response(200, {
        "items": output,
        "meta": {
            "count": len(output),
            "publicationRule": "published records with tier 1 or tier 2 dated HTTPS evidence only",
        },
    })


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "public, max-age=300"},
        "body": json.dumps(body, default=serializable),
    }
