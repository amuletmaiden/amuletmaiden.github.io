# Katherine's Stacks

A portable personal-library shell for humans and agents. It is one Python file and uses only the standard library.

## Start the human interface

```bash
python katherines_stacks.py serve
```

Then open `http://127.0.0.1:8765/`.

## Agent / CLI interface

```bash
python katherines_stacks.py search "Pride and Prejudice"
python katherines_stacks.py book <32-hex-record-id>
python katherines_stacks.py options <32-hex-record-id>
```

Each command prints JSON.

## Agent / HTTP interface

Once `serve` is running:

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

No database, Node, browser extension, package install, account, or kt-bus installation is required.
