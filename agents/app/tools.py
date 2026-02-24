from __future__ import annotations

from typing import Any

from psycopg import connect
from psycopg.rows import dict_row

from .settings import Settings

try:
    from tavily import TavilyClient
except Exception:  # pragma: no cover - optional dependency behavior
    TavilyClient = None  # type: ignore



def _fetch_all(settings: Settings, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with connect(settings.agents_database_url_readonly, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            return [dict(row) for row in rows]



def _fetch_one(settings: Settings, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    rows = _fetch_all(settings, query, params)
    if not rows:
        return None
    return rows[0]



def get_lead_snapshot(lead_id: str, settings: Settings) -> dict[str, Any]:
    lead = _fetch_one(
        settings,
        '''
        SELECT "id", "projectName", "locationText", "currentStatus", "createdAt"
        FROM "Lead"
        WHERE "id" = %s
        ''',
        (lead_id,),
    )

    if not lead:
        return {
            "lead": None,
            "facts": [],
        }

    facts = _fetch_all(
        settings,
        '''
        SELECT "factKey", "factValue", "confidence"
        FROM "LeadFact"
        WHERE "leadId" = %s
        ORDER BY "createdAt" ASC
        ''',
        (lead_id,),
    )

    return {
        "lead": {
            "id": lead["id"],
            "projectName": lead.get("projectName"),
            "locationText": lead.get("locationText"),
            "currentStatus": lead.get("currentStatus"),
            "createdAt": lead.get("createdAt").isoformat() if lead.get("createdAt") else None,
        },
        "facts": [
            {
                "factKey": row["factKey"],
                "factValue": row["factValue"],
                "confidence": float(row["confidence"]),
            }
            for row in facts
        ],
    }



def list_business_units(settings: Settings) -> list[dict[str, Any]]:
    rows = _fetch_all(
        settings,
        '''
        SELECT "id", "code", "name", "description"
        FROM "BusinessUnit"
        WHERE "isActive" = TRUE
        ORDER BY "name" ASC
        ''',
    )
    return [
        {
            "id": row["id"],
            "code": row["code"],
            "name": row["name"],
            "description": row.get("description"),
        }
        for row in rows
    ]



def get_business_unit_profile(bu_code: str, settings: Settings) -> dict[str, Any]:
    profile = _fetch_one(
        settings,
        '''
        SELECT bu."id", bu."code", bu."name", bu."description"
        FROM "BusinessUnit" bu
        WHERE bu."code" = %s AND bu."isActive" = TRUE
        ''',
        (bu_code,),
    )

    if not profile:
        return {
            "businessUnit": None,
            "activeRuleSetCount": 0,
            "conditionCount": 0,
            "activeSkuCount": 0,
        }

    rule_data = _fetch_one(
        settings,
        '''
        SELECT COUNT(*)::int AS "activeRuleSetCount",
               COALESCE(SUM(condition_count), 0)::int AS "conditionCount"
        FROM (
            SELECT rs."id", COUNT(rc."id") AS condition_count
            FROM "RoutingRuleSet" rs
            LEFT JOIN "RoutingRuleCondition" rc ON rc."ruleSetId" = rs."id"
            WHERE rs."businessUnitId" = %s AND rs."status" = 'ACTIVE'
            GROUP BY rs."id"
        ) t
        ''',
        (profile["id"],),
    )

    sku_data = _fetch_one(
        settings,
        '''
        SELECT COUNT(*)::int AS "activeSkuCount"
        FROM "BuSku"
        WHERE "businessUnitId" = %s AND "isActive" = TRUE
        ''',
        (profile["id"],),
    )

    return {
        "businessUnit": {
            "id": profile["id"],
            "code": profile["code"],
            "name": profile["name"],
            "description": profile.get("description"),
        },
        "activeRuleSetCount": int(rule_data["activeRuleSetCount"]) if rule_data else 0,
        "conditionCount": int(rule_data["conditionCount"]) if rule_data else 0,
        "activeSkuCount": int(sku_data["activeSkuCount"]) if sku_data else 0,
    }



def list_bu_skus(bu_code: str, settings: Settings) -> list[dict[str, Any]]:
    rows = _fetch_all(
        settings,
        '''
        SELECT sku."id", sku."skuCode", sku."skuName", sku."skuCategory", bu."code" AS "businessUnitCode"
        FROM "BuSku" sku
        INNER JOIN "BusinessUnit" bu ON bu."id" = sku."businessUnitId"
        WHERE bu."code" = %s AND bu."isActive" = TRUE AND sku."isActive" = TRUE
        ORDER BY sku."skuCode" ASC
        ''',
        (bu_code,),
    )
    return [
        {
            "id": row["id"],
            "businessUnitCode": row["businessUnitCode"],
            "skuCode": row["skuCode"],
            "skuName": row["skuName"],
            "skuCategory": row.get("skuCategory"),
        }
        for row in rows
    ]



def find_similar_leads(filters: dict[str, str], settings: Settings) -> list[dict[str, Any]]:
    supported = {"project_type", "project_stage", "development_type", "region"}
    wanted = [(key, value) for key, value in filters.items() if key in supported and value]
    if not wanted:
        return []

    clauses: list[str] = []
    params: list[Any] = []
    for key, value in wanted:
        clauses.append('(lf."factKey" = %s AND lf."factValue" = %s)')
        params.extend([key, value])

    query = f'''
        SELECT l."id", l."projectName", l."locationText", l."currentStatus", COUNT(*)::int AS "matchCount"
        FROM "Lead" l
        INNER JOIN "LeadFact" lf ON lf."leadId" = l."id"
        WHERE {' OR '.join(clauses)}
        GROUP BY l."id"
        ORDER BY "matchCount" DESC, l."createdAt" DESC
        LIMIT 5
    '''

    rows = _fetch_all(settings, query, tuple(params))
    return [
        {
            "leadId": row["id"],
            "projectName": row.get("projectName"),
            "locationText": row.get("locationText"),
            "currentStatus": row.get("currentStatus"),
            "matchCount": row.get("matchCount", 0),
        }
        for row in rows
    ]



def get_routing_constraints() -> dict[str, Any]:
    return {
        "maxBusinessUnits": 3,
        "maxCrossSell": 2,
        "maxSkuPerBusinessUnit": 3,
        "minBusinessUnitConfidence": 0.2,
        "messageRules": {
            "maxConversationMessages": 12,
            "maxSummaryLength": 500,
        },
    }



def web_market_signal(query: str, settings: Settings) -> list[dict[str, Any]]:
    if not settings.enable_market_signal_tool:
        return []
    if not settings.tavily_api_key or TavilyClient is None:
        return []

    client = TavilyClient(api_key=settings.tavily_api_key)
    try:
        response = client.search(query=query, max_results=3)
    except Exception:
        return []

    results = response.get("results", []) if isinstance(response, dict) else []
    normalized: list[dict[str, Any]] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "title": str(item.get("title", "")),
                "url": str(item.get("url", "")),
                "content": str(item.get("content", ""))[:300],
            }
        )
    return normalized
