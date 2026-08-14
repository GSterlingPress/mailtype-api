# MAILTYPE

**Email/domain → objective mail capability intelligence.**

MAILTYPE is a tiny REST + MCP API for applications that need fast, objective domain-level email infrastructure answers before accepting, storing, routing, or acting on an email address.

**Live API:** https://mailtype-api.onrender.com/docs  
**OpenAPI:** https://mailtype-api.onrender.com/openapi.json  
**Playground:** https://mailtype-api.onrender.com/play?q=gmail.com  
**MCP endpoint:** https://mailtype-api.onrender.com/mcp

## What it returns

- `DOMAIN_EXISTS`
- `CAN_RECEIVE_MAIL`
- MX records and provider
- disposable-domain evidence
- SPF
- DMARC
- MTA-STS
- confidence, evidence, and `checked_at`

## Why MAILTYPE

MAILTYPE deliberately does **not** perform SMTP probing or claim that an individual mailbox exists. It answers the cheaper, objective domain-level questions that software often needs first. `UNKNOWN` is a valid answer whenever the evidence is insufficient.

## REST

```bash
curl -H "X-API-Key: YOUR_KEY" \
  https://mailtype-api.onrender.com/v1/domain/gmail.com

curl -H "X-API-Key: YOUR_KEY" \
  https://mailtype-api.onrender.com/v1/email/person@gmail.com
```

## MCP

Endpoint: `POST https://mailtype-api.onrender.com/mcp`

Tool: `inspect_mail_domain`

Input:

```json
{"input":"gmail.com"}
```

## Public discovery endpoints

- Docs: https://mailtype-api.onrender.com/docs
- Playground: https://mailtype-api.onrender.com/play?q=gmail.com
- OpenAPI 3.1: https://mailtype-api.onrender.com/openapi.json
- Sources and methodology: https://mailtype-api.onrender.com/sources
- Health: https://mailtype-api.onrender.com/health

## Data and standards

MAILTYPE uses DNS evidence plus a maintained legally reusable disposable-domain dataset. The API exposes its methodology and source disclosure publicly. Relevant standards include RFC 5321, RFC 7505 (Null MX), RFC 7208 (SPF), RFC 7489 (DMARC), and RFC 8461 (MTA-STS).

## Hard boundary

MAILTYPE does not verify that a mailbox exists, connect to recipient SMTP servers, send email, infer deliverability from opaque scores, or claim `CAN_RECEIVE_MAIL=YES` without explicit MX evidence. If a domain exists but explicit MX evidence is insufficient, MAILTYPE returns `UNKNOWN`.

## Stranger Verification Standard

Our own tests, health probes, validators, uptime traffic, and known internal callers do not count as adoption. A tool call alone does not automatically become a verified stranger; outside calls remain unverified until evidence supports credible real use.

## Keywords

email API · domain API · MX lookup API · disposable email domain API · SPF API · DMARC API · MTA-STS API · email infrastructure · email validation preflight · MCP server · developer API
