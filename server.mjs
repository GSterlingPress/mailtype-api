import http from 'node:http';
import crypto from 'node:crypto';
import {
  inspectInput,
  refreshDisposableList,
  getDisposableStatus
} from './mailtype.mjs';

const PORT = process.env.PORT || 8788;

const API_KEYS = (process.env.MAILTYPE_API_KEYS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const REQUIRE_AUTH = API_KEYS.length > 0;

const internalUA =
  /curl|postman|validator|health|uptime|mailtype-internal|sterling-activity-dashboard|render\/health/i;

const memoryRate = new Map();

/*
  Activity is intentionally conservative.

  CORE USE:
  authenticated /v1/domain, /v1/email and MCP tool calls from
  callers that are not explicitly classified as validators/internal.

  VERIFIED STRANGERS:
  never awarded merely because a core call occurred.
  V1 leaves genuine outside core callers as UNKNOWN_MACHINE until
  retained evidence is sufficient to classify CREDIBLE_REAL_USE.
*/

const activity = {
  startedAt: new Date().toISOString(),
  coreEvents: [],
  callers: new Map()
};

const MAX_ACTIVITY_EVENTS = 1000;

function send(res, status, obj, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    ...headers
  });
  res.end(JSON.stringify(obj));
}

function html(res, status, body) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'access-control-allow-origin': '*'
  });
  res.end(body);
}

function token(req) {
  return (
    req.headers['x-api-key'] ||
    String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  );
}

function auth(req) {
  return !REQUIRE_AUTH || API_KEYS.includes(token(req));
}

function caller(req) {
  return crypto
    .createHash('sha256')
    .update(
      String(
        String(req.headers['x-forwarded-for'] || '')
          .split(',')[0]
          .trim() ||
          req.socket.remoteAddress ||
          ''
      ) +
        '|' +
        String(req.headers['user-agent'] || '')
    )
    .digest('hex')
    .slice(0, 16);
}

function classifyCaller(req) {
  const ua = req.headers['user-agent'] || '';

  if (
    req.headers['x-mailtype-test'] === '1' ||
    req.headers['x-tollbooth-internal'] === '1' ||
    internalUA.test(ua)
  ) {
    return 'KNOWN_VALIDATOR';
  }

  return 'UNKNOWN_MACHINE';
}

function log(req, event, extra = {}) {
  const rec = {
    ts: new Date().toISOString(),
    service: 'MAILTYPE',
    event,
    method: req.method,
    path: req.url,
    ua: req.headers['user-agent'] || '',
    caller: caller(req),
    classification: classifyCaller(req),
    ...extra
  };

  console.log(JSON.stringify(rec));
  return rec;
}

function recordCoreUse(req, event, extra = {}) {
  const rec = log(req, event, extra);

  activity.coreEvents.push(rec);

  if (activity.coreEvents.length > MAX_ACTIVITY_EVENTS) {
    activity.coreEvents.shift();
  }

  const previous = activity.callers.get(rec.caller) || {
    firstSeen: rec.ts,
    calls: 0,
    classification: rec.classification
  };

  previous.calls += 1;
  previous.lastSeen = rec.ts;

  /*
    Never promote UNKNOWN_MACHINE simply because it called the API.
    KNOWN_VALIDATOR remains excluded from outside adoption.
  */
  if (rec.classification === 'KNOWN_VALIDATOR') {
    previous.classification = 'KNOWN_VALIDATOR';
  }

  activity.callers.set(rec.caller, previous);

  return rec;
}

function activitySnapshot() {
  const externalCore = activity.coreEvents.filter(
    e => e.classification !== 'KNOWN_VALIDATOR'
  );

  const externalCallers = new Set(externalCore.map(e => e.caller));

  const verified = externalCore.filter(
    e => e.classification === 'CREDIBLE_REAL_USE'
  );

  const verifiedCallers = new Set(verified.map(e => e.caller));

  return {
    service: 'MAILTYPE',
    generatedAt: new Date().toISOString(),
    startedAt: activity.startedAt,

    realUse: {
      allTimeCalls: externalCore.length,
      allTimeCallers: externalCallers.size,
      allTimeVerifiedStrangers: verifiedCallers.size
    },

    coreUse: externalCore.length,
    callers: externalCallers.size,
    verifiedStrangers: verifiedCallers.size,

    verificationPolicy: {
      rule:
        'A core invocation is evidence of use, not automatically evidence of a genuine stranger.',
      classes: [
        'KNOWN_VALIDATOR',
        'LIKELY_VALIDATOR',
        'UNKNOWN_MACHINE',
        'CREDIBLE_REAL_USE'
      ],
      currentPromotionPolicy:
        'Outside core calls remain UNKNOWN_MACHINE until evidence supports CREDIBLE_REAL_USE.'
    },

    candidateRealUse: externalCore
      .slice(-50)
      .reverse()
      .map(e => ({
        at: e.ts,
        event: e.event,
        caller: e.caller,
        classification: e.classification,
        domain: e.domain || null,
        mode: e.mode || null
      }))
  };
}

function rateLimit(req, limit = 30) {
  const key = caller(req);
  const now = Date.now();
  const windowMs = 60000;

  const old = memoryRate.get(key) || [];
  const recent = old.filter(t => now - t < windowMs);

  recent.push(now);
  memoryRate.set(key, recent);

  return {
    ok: recent.length <= limit,
    remaining: Math.max(0, limit - recent.length)
  };
}

async function readJson(req) {
  let b = '';

  for await (const c of req) {
    b += c;

    if (b.length > 10000) {
      throw new Error('body_too_large');
    }
  }

  return JSON.parse(b || '{}');
}

function docs() {
  return `<!doctype html>
<meta name="viewport" content="width=device-width">
<title>MAILTYPE API</title>
<style>
body{font:16px system-ui;max-width:900px;margin:50px auto;padding:20px;color:#17201b}
h1{font-size:56px;letter-spacing:-3px}
code,pre{background:#f1f3ef;padding:3px 6px;border-radius:6px}
pre{padding:16px;overflow:auto}
.box{border:1px solid #ddd;border-radius:14px;padding:16px;margin:16px 0}
input,button{padding:11px;font:inherit}
</style>

<h1>MAILTYPE</h1>

<p><b>Email/domain → objective mail capability.</b></p>

<p>
DNS-level truth only. No SMTP probing. No messages sent.
No mailbox verification. UNKNOWN is a valid answer.
</p>

<div class="box">
<h2>Try it</h2>
<form action="/play" method="get">
<input name="q" value="gmail.com">
<button>Inspect</button>
</form>
</div>

<h2>REST</h2>

<pre>GET /v1/domain/gmail.com
GET /v1/email/person@example.com
X-API-Key: YOUR_KEY</pre>

<h2>MCP</h2>

<p>POST <code>/mcp</code> · tool <code>inspect_mail_domain</code></p>

<p>
<a href="/openapi.json">OpenAPI</a> ·
<a href="/sources">Sources</a> ·
<a href="/health">Health</a>
</p>`;
}

function openapi() {
  return {
    openapi: '3.1.0',

    info: {
      title: 'MAILTYPE API',
      version: '1.0.0',
      description:
        'Objective DNS-level email/domain capability intelligence.'
    },

    paths: {
      '/v1/domain/{domain}': {
        get: {
          summary: 'Inspect a mail domain',
          parameters: [
            {
              name: 'domain',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Mail-domain intelligence'
            }
          }
        }
      },

      '/v1/email/{email}': {
        get: {
          summary: 'Inspect the domain of an email address',
          parameters: [
            {
              name: 'email',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Mail-domain intelligence'
            }
          }
        }
      }
    }
  };
}

await refreshDisposableList().catch(() => {});

setInterval(
  () => refreshDisposableList().catch(() => {}),
  24 * 60 * 60 * 1000
).unref();

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers':
          'content-type,x-api-key,authorization,x-mailtype-test,x-tollbooth-internal',
        'access-control-allow-methods': 'GET,POST,OPTIONS'
      });

      return res.end();
    }

    if (u.pathname === '/health') {
      return send(res, 200, {
        ok: true,
        service: 'MAILTYPE',
        version: '1.0.0',
        disposable_dataset: getDisposableStatus()
      });
    }

    /*
      Public read-only activity endpoint.
      Reading this endpoint does NOT create an activity event.
    */
    if (req.method === 'GET' && u.pathname === '/v1/activity') {
      return send(res, 200, activitySnapshot());
    }

    if (u.pathname === '/' || u.pathname === '/docs') {
      return html(res, 200, docs());
    }

    if (u.pathname === '/openapi.json') {
      return send(res, 200, openapi());
    }

    if (u.pathname === '/sources') {
      return send(res, 200, {
        methodology:
          'DNS-level inspection only. MAILTYPE does not connect to recipient SMTP servers, send email, or claim mailbox existence.',

        sources: [
          {
            name: 'DNS',
            purpose: 'MX/TXT/A/AAAA/NS evidence',
            method:
              'system resolver with Google Public DNS-over-HTTPS fallback'
          },
          {
            name: 'disposable/disposable-email-domains',
            license: 'MIT',
            purpose: 'known disposable-domain evidence',
            update: 'daily upstream'
          }
        ],

        standards: [
          {
            name: 'RFC 5321',
            purpose: 'SMTP/MX semantics'
          },
          {
            name: 'RFC 7505',
            purpose:
              'Null MX — domain explicitly does not accept email'
          },
          {
            name: 'RFC 7208',
            purpose: 'SPF'
          },
          {
            name: 'RFC 7489',
            purpose: 'DMARC'
          },
          {
            name: 'RFC 8461',
            purpose: 'MTA-STS'
          }
        ],

        honesty:
          'NO means positive negative evidence such as NXDOMAIN or Null MX. UNKNOWN is used when DNS evidence cannot substantiate YES or NO.'
      });
    }

    if (u.pathname === '/play') {
      const r = rateLimit(req, 30);

      if (!r.ok) {
        return send(res, 429, {
          error: 'playground_rate_limited'
        });
      }

      const q = u.searchParams.get('q') || '';
      const out = await inspectInput(q);

      /*
        Playground usage is logged for diagnostics,
        but does NOT become core-use adoption.
      */
      log(req, 'public_playground', {
        domain: out.domain,
        can_receive_mail: out.can_receive_mail,
        disposable: out.disposable
      });

      return html(
        res,
        200,
        `<meta name="viewport" content="width=device-width">
<style>
body{font:16px system-ui;max-width:800px;margin:50px auto;padding:20px}
pre{background:#f1f3ef;padding:16px;overflow:auto}
</style>
<h1>${out.domain || q}</h1>
<pre>${JSON.stringify(out, null, 2).replace(/</g, '&lt;')}</pre>
<p><a href="/docs">← MAILTYPE</a></p>`
      );
    }

    if (!auth(req)) {
      return send(res, 401, {
        error: 'unauthorized'
      });
    }

    if (
      req.method === 'GET' &&
      u.pathname.startsWith('/v1/domain/')
    ) {
      const input = decodeURIComponent(
        u.pathname.slice('/v1/domain/'.length)
      );

      const out = await inspectInput(input);

      recordCoreUse(req, 'core_lookup', {
        mode: 'domain',
        domain: out.domain,
        can_receive_mail: out.can_receive_mail,
        disposable: out.disposable
      });

      return send(res, 200, out);
    }

    if (
      req.method === 'GET' &&
      u.pathname.startsWith('/v1/email/')
    ) {
      const input = decodeURIComponent(
        u.pathname.slice('/v1/email/'.length)
      );

      const out = await inspectInput(input);

      recordCoreUse(req, 'core_lookup', {
        mode: 'email',
        domain: out.domain,
        can_receive_mail: out.can_receive_mail,
        disposable: out.disposable
      });

      return send(res, 200, out);
    }

    if (req.method === 'POST' && u.pathname === '/mcp') {
      const j = await readJson(req);

      if (j.method === 'initialize') {
        return send(res, 200, {
          jsonrpc: '2.0',
          id: j.id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'mailtype',
              version: '1.0.0'
            }
          }
        });
      }

      if (j.method === 'tools/list') {
        return send(res, 200, {
          jsonrpc: '2.0',
          id: j.id,
          result: {
            tools: [
              {
                name: 'inspect_mail_domain',
                description:
                  'Inspect objective DNS-level email/domain capability. Does not verify a mailbox.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    input: {
                      type: 'string',
                      description: 'Email address or domain'
                    }
                  },
                  required: ['input']
                }
              }
            ]
          }
        });
      }

      if (
        j.method === 'tools/call' &&
        j.params?.name === 'inspect_mail_domain'
      ) {
        const out = await inspectInput(
          j.params.arguments.input
        );

        recordCoreUse(req, 'mcp_tool_call', {
          domain: out.domain,
          can_receive_mail: out.can_receive_mail,
          disposable: out.disposable
        });

        return send(res, 200, {
          jsonrpc: '2.0',
          id: j.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(out)
              }
            ],
            structuredContent: out
          }
        });
      }

      return send(res, 400, {
        jsonrpc: '2.0',
        id: j.id,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      });
    }

    return send(res, 404, {
      error: 'not_found'
    });
  } catch (e) {
    console.error(e);

    return send(res, 400, {
      error: e.message || 'request_failed'
    });
  }
});

server.listen(PORT, () =>
  console.log(`MAILTYPE listening on ${PORT}`)
);
