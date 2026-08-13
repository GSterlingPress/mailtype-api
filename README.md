# MAILTYPE V1

**Email/domain → objective domain-level mail capability.**

V1 returns DOMAIN_EXISTS, CAN_RECEIVE_MAIL, MX records/provider, DISPOSABLE, SPF, DMARC, MTA-STS, confidence/evidence, and checked_at.

## Hard boundary

MAILTYPE does not verify a mailbox exists, connect to recipient SMTP servers, send email, infer deliverability from opaque scores, or claim CAN_RECEIVE_MAIL=YES without explicit MX evidence. If a domain exists but explicit MX is not found, V1 returns UNKNOWN.

## API

```bash
curl -H "X-API-Key: YOUR_KEY" https://YOUR-SERVICE.onrender.com/v1/domain/gmail.com
curl -H "X-API-Key: YOUR_KEY" https://YOUR-SERVICE.onrender.com/v1/email/person@gmail.com
```

MCP endpoint: `POST /mcp`
Tool: `inspect_mail_domain`

Public endpoints: `/docs`, `/play?q=gmail.com`, `/openapi.json`, `/sources`, `/health`.

## Stranger Verification Standard

`X-MAILTYPE-Test: 1`, health probes, validators and obvious uptime traffic are classified as KNOWN_VALIDATOR. Everything else starts UNKNOWN_MACHINE and is not automatically counted as a verified stranger.
