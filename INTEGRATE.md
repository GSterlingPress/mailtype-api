# Integrate MAILTYPE

Inspect objective email-domain capability before software accepts, routes, or acts on an address: MX, provider, disposable status, SPF, DMARC, and MTA-STS.

## 30-second test

```bash
curl -s "https://mailtype-api.onrender.com/play?q=gmail.com"
```

## Remote MCP

```text
https://mailtype-api.onrender.com/mcp
```

## Production

- REST/docs base: https://mailtype-api.onrender.com
- MCP: https://mailtype-api.onrender.com/mcp
- Repository: https://github.com/GSterlingPress/mailtype-api

## Where it belongs

Put MAILTYPE immediately before the machine decision it improves, inside agent tool wrappers, workflow engines, middleware, job runners, or backend orchestration. Keep the integration narrow and observable. Do not count health checks, validators, crawlers, or our own tests as adoption.

## Failure behavior

Treat this as an advisory/reliability service, not magical certainty. If it is unavailable or returns insufficient evidence, preserve your application's existing safe fallback and never upgrade UNKNOWN into certainty.
