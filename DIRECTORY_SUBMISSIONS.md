# MAILTYPE directory submission kit

Use this file for directories that require an authenticated/manual submission.

## Canonical listing

**Name:** MAILTYPE API

**Website/docs:** https://mailtype-api.onrender.com/docs

**OpenAPI:** https://mailtype-api.onrender.com/openapi.json

**GitHub:** https://github.com/GSterlingPress/mailtype-api

**MCP endpoint:** https://mailtype-api.onrender.com/mcp

**One-line description:** Email/domain → objective mail capability: domain existence, MX/provider, disposable-domain evidence, SPF, DMARC and MTA-STS without SMTP probing.

**Long description:** MAILTYPE is a lightweight REST + MCP API for applications that need objective domain-level email infrastructure intelligence. It checks domain existence, explicit mail-receiving capability, MX records/provider, disposable-domain evidence, SPF, DMARC and MTA-STS and returns confidence/evidence. It does not connect to recipient SMTP servers, send email or claim mailbox existence; UNKNOWN is returned when evidence is insufficient.

**Category:** Email / Developer Tools / DNS

**Authentication:** API key

**Protocol:** HTTPS REST + MCP

**CORS:** Yes

**Pricing:** Currently free during early developer testing

**Use cases:**
- reject nonexistent email domains before expensive downstream work
- detect domains that explicitly cannot receive email
- identify disposable-email domains
- identify MX/mail provider
- inspect SPF, DMARC and MTA-STS posture
- provide email-domain infrastructure context to agents through MCP

## Priority submission targets

1. APIs.guru — submit stable OpenAPI URL.
2. FindAPI — submit API name, docs URL, description, API-key auth, HTTPS, CORS, current free status.
3. Glama — submit GitHub repository / remote MCP endpoint.
4. Smithery — add the remote MCP server/repository.
5. PulseMCP — submit the remote MCP server.
6. MCP.so — submit the remote MCP server/repository.
7. Official MCP Registry — publish after confirming its current package/remote-server requirements.
8. Postman Public API Network — publish an imported OpenAPI collection/workspace.

## Stranger Verification

Directory crawlers, validators, health probes, our own tests, and submission checks must not be counted as verified stranger adoption. The success event is a credible outside developer making a core REST lookup or MCP tool call.
