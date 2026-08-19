# Katherine's Stacks

A portable personal-library shell for humans and agents.

## Human use

Download `Katherines Stacks.pyw` and double-click it. It starts quietly, opens the Stacks search page in the default browser, and shows no terminal window. The launcher loads the current Stacks core automatically, so the human-facing install is one file.

The human interface is an ordinary search page with results, covers, record inspection, and acquisition choices.

## Agent use

The portable core is `katherines_stacks.py`. It uses only the Python standard library and exposes the same operations as JSON.

CLI operations (for agents or integrations that prefer subprocess tools):

```bash
python katherines_stacks.py search "Pride and Prejudice"
python katherines_stacks.py book <32-hex-record-id>
python katherines_stacks.py options <32-hex-record-id>
```

HTTP operations while the core is serving:

- `GET /api/status`
- `GET /api/search?q=<query>&limit=40`
- `GET /api/book/<32-hex-record-id>`
- `GET /api/options/<32-hex-record-id>`

Suggested agent flow:

1. Search for the work.
2. Inspect likely records and their metadata.
3. Ask for acquisition options only after choosing the correct record.
4. Apply the agent's own judgment before following an acquisition option.

Stacks owns the visible search, result, and record interface. The underlying catalog is treated as an implementation detail and the UI carries only Katherine's Stacks branding.

## Configuration

Optional environment variables:

- `STACKS_MIRRORS` — comma-separated upstream endpoints.
- `STACKS_TIMEOUT` — request timeout in seconds (default 20).
- `STACKS_CACHE_TTL` — metadata cache duration in seconds (default 90).

No Node, browser extension, database, account, or kt-bus installation is required.
