#!/usr/bin/env python3
"""Katherine's Stacks — portable catalog shell for humans and agents.

One file, Python standard library only.

Human UI:
    python katherines_stacks.py serve

Agent/CLI:
    python katherines_stacks.py search "Pride and Prejudice"
    python katherines_stacks.py book <32-hex-record-id>
    python katherines_stacks.py options <32-hex-record-id>

The same operations are exposed as JSON over localhost:
    GET /api/search?q=...
    GET /api/book/<id>
    GET /api/options/<id>

The tool deliberately separates discovery from acquisition. It exposes the
acquisition choices advertised by a record, while leaving selection of an
option to the caller rather than silently choosing or bulk-fetching files.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_NAME = "Katherine's Stacks"
VERSION = "0.2.0"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_MIRRORS = (
    "https://annas-archive.gl",
    "https://annas-archive.pk",
    "https://annas-archive.gd",
)
MIRRORS = tuple(
    x.strip().rstrip("/")
    for x in os.environ.get("STACKS_MIRRORS", ",".join(DEFAULT_MIRRORS)).split(",")
    if x.strip()
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}
TIMEOUT = float(os.environ.get("STACKS_TIMEOUT", "20"))
CACHE_TTL = float(os.environ.get("STACKS_CACHE_TTL", "90"))
MD5_RE = re.compile(r"^[0-9a-f]{32}$", re.I)
FILE_EXT_RE = re.compile(r"\.(?:pdf|epub|mobi|azw3|djvu|fb2|txt|rtf|cbz|cbr)(?:$|[?#])", re.I)
_CACHE: dict[str, tuple[float, object]] = {}
_CACHE_LOCK = threading.Lock()


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag: str, attrs=None, parent=None):
        self.tag = tag
        self.attrs = dict(attrs or [])
        self.children: list[Node | str] = []
        self.parent = parent

    def text(self) -> str:
        return clean(" ".join(c if isinstance(c, str) else c.text() for c in self.children))

    def classes(self) -> set[str]:
        return set((self.attrs.get("class") or "").split())


class DOM(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("document")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag.lower(), attrs, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag.lower() not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag.lower(), attrs, self.stack[-1]))

    def handle_endtag(self, tag):
        tag = tag.lower()
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        if data:
            self.stack[-1].children.append(data)


def walk(node: Node):
    for child in node.children:
        if isinstance(child, Node):
            yield child
            yield from walk(child)


def descendants(node: Node, tag: str | None = None):
    for child in walk(node):
        if tag is None or child.tag == tag:
            yield child


def closest(node: Node | None, tag: str | None = None, stop: Node | None = None):
    cur = node
    while cur is not None and cur is not stop:
        if tag is None or cur.tag == tag:
            return cur
        cur = cur.parent
    return None


def parse_html(text: str) -> DOM:
    p = DOM()
    p.feed(text)
    return p


def cached(key: str, producer):
    now = time.time()
    with _CACHE_LOCK:
        hit = _CACHE.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]
    value = producer()
    with _CACHE_LOCK:
        _CACHE[key] = (now, value)
    return value


def fetch_upstream(path: str) -> tuple[str, str]:
    errors: list[str] = []
    for base in MIRRORS:
        url = urllib.parse.urljoin(base + "/", path.lstrip("/"))
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace"), base
        except Exception as exc:
            errors.append(f"{urllib.parse.urlsplit(base).netloc}: {exc}")
    raise RuntimeError("No catalog endpoint responded. " + " | ".join(errors))


def extract_format(meta: str) -> str | None:
    known = {"pdf", "epub", "mobi", "azw3", "djvu", "fb2", "txt", "rtf", "cbz", "cbr"}
    for seg in (clean(x).lower() for x in meta.split("·")):
        if seg in known:
            return seg
    return None


def choose_card(anchor: Node) -> Node:
    card = anchor
    for _ in range(7):
        if card.parent is None:
            break
        card = card.parent
        classes = card.classes()
        if "flex" in classes and any(c.startswith("pt-") for c in classes):
            break
    return card


def find_author(card: Node) -> str:
    for span in descendants(card, "span"):
        if "mdi--user-edit" in (span.attrs.get("class") or ""):
            a = closest(span.parent, "a", card.parent)
            if a and a.text():
                return a.text()
    for a in descendants(card, "a"):
        href = a.attrs.get("href", "")
        text = a.text()
        if "/search" in href and text and len(text) < 180:
            return text
    return ""


def find_cover(card: Node, base: str) -> str | None:
    fallback = None
    for img in descendants(card, "img"):
        src = img.attrs.get("src") or img.attrs.get("data-src")
        if not src:
            continue
        fallback = fallback or src
        cur = img.parent
        while cur and cur is not card.parent:
            if (cur.attrs.get("id") or "").startswith("list_cover_aarecord_id__"):
                return urllib.parse.urljoin(base + "/", src)
            cur = cur.parent
    return urllib.parse.urljoin(base + "/", fallback) if fallback else None


def find_meta(card: Node) -> str:
    candidates: list[tuple[int, str]] = []
    for div in descendants(card, "div"):
        text = div.text()
        if "·" not in text or not any(x in text for x in ("MB", "KB", "GB", "📕", "📘", "📗")):
            continue
        depth = 0
        cur = div.parent
        while cur and cur is not card:
            depth += 1
            cur = cur.parent
        candidates.append((depth, text))
    return max(candidates, default=(0, ""), key=lambda x: x[0])[1]


def parse_search(page_html: str, base: str, limit: int = 40) -> list[dict]:
    root = parse_html(page_html).root
    out: list[dict] = []
    seen: set[str] = set()
    for a in descendants(root, "a"):
        href = a.attrs.get("href", "")
        if not href.startswith("/md5/"):
            continue
        record_id = href.rsplit("/", 1)[-1].lower()
        if not MD5_RE.fullmatch(record_id) or record_id in seen:
            continue
        title = a.text()
        if not title:
            continue
        card = choose_card(a)
        meta = find_meta(card)
        out.append({
            "id": record_id,
            "title": title,
            "author": find_author(card),
            "format": extract_format(meta),
            "meta": meta,
            "cover": find_cover(card, base),
        })
        seen.add(record_id)
        if len(out) >= limit:
            break
    return out


def search(query: str, limit: int = 40) -> dict:
    query = clean(query)
    if not query:
        return {"query": "", "results": []}

    def produce():
        page, base = fetch_upstream("/search?" + urllib.parse.urlencode({"q": query}))
        return {"query": query, "results": parse_search(page, base, limit)}

    return cached(f"search:{query.lower()}:{limit}", produce)


def first_heading(root: Node) -> str:
    for tag in ("h1", "h2"):
        for n in descendants(root, tag):
            t = n.text()
            if t and len(t) < 500:
                return t
    return ""


def record(record_id: str) -> dict:
    record_id = record_id.lower()
    if not MD5_RE.fullmatch(record_id):
        raise ValueError("Invalid record id")

    def produce():
        page, base = fetch_upstream(f"/md5/{record_id}")
        root = parse_html(page).root
        text = root.text()
        snippets: list[str] = []
        for piece in re.split(r"(?<=[.!?])\s+", text):
            piece = clean(piece)
            if 45 <= len(piece) <= 420 and piece not in snippets:
                snippets.append(piece)
            if len(snippets) >= 8:
                break
        return {
            "id": record_id,
            "title": first_heading(root),
            "summary": snippets,
            "option_count": len(parse_options_from_root(root, base)),
        }

    return cached("book:" + record_id, produce)


def option_kind(url: str, base: str) -> str:
    if FILE_EXT_RE.search(url):
        return "file"
    u = urllib.parse.urlsplit(url)
    b = urllib.parse.urlsplit(base)
    return "upstream" if u.netloc == b.netloc else "external"


def parse_options_from_root(root: Node, base: str) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    positive = ("download", "slow", "fast", "ipfs", "libgen", "mirror", "get file", "external")
    negative = ("search", "login", "register", "donate", "account", "faq", "blog", "datasets")
    for a in descendants(root, "a"):
        href = clean(a.attrs.get("href"))
        if not href or href.startswith(("#", "javascript:", "mailto:")):
            continue
        label = clean(a.text())
        url = urllib.parse.urljoin(base + "/", href)
        hay = (label + " " + href).lower()
        if any(x in hay for x in negative):
            continue
        external = urllib.parse.urlsplit(url).netloc != urllib.parse.urlsplit(base).netloc
        likely = external or FILE_EXT_RE.search(url) or any(x in hay for x in positive)
        if not likely or url in seen:
            continue
        seen.add(url)
        out.append({
            "label": label or f"Option {len(out) + 1}",
            "url": url,
            "kind": option_kind(url, base),
            "host": urllib.parse.urlsplit(url).netloc,
        })
        if len(out) >= 30:
            break
    return out


def options(record_id: str) -> dict:
    record_id = record_id.lower()
    if not MD5_RE.fullmatch(record_id):
        raise ValueError("Invalid record id")

    def produce():
        page, base = fetch_upstream(f"/md5/{record_id}")
        root = parse_html(page).root
        return {
            "id": record_id,
            "title": first_heading(root),
            "options": parse_options_from_root(root, base),
        }

    return cached("options:" + record_id, produce)


UI = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Katherine's Stacks</title><style>
:root{--bg:#09100c;--panel:#101a14;--panel2:#15231a;--ink:#edf8f0;--muted:#94aa9c;--line:#294035;--g:#43e47c;--b:#58b8ff;--shadow:0 18px 54px #0005}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}body{background:radial-gradient(circle at 10% -5%,#43e47c24,transparent 32rem),radial-gradient(circle at 95% 0,#58b8ff20,transparent 30rem),var(--bg)}button,input{font:inherit}.shell{width:min(1100px,calc(100% - 28px));margin:auto;padding:42px 0 70px}h1{font-size:clamp(2.8rem,8vw,6.8rem);line-height:.85;letter-spacing:-.07em;margin:0}.g{color:var(--g)}.b{color:var(--b)}.sub{color:var(--muted);margin:18px 0 26px}.search{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px;border:1px solid var(--line);border-radius:15px;background:#101a14ee;position:sticky;top:10px;z-index:5;box-shadow:var(--shadow)}.search input{background:transparent;border:0;outline:0;color:var(--ink);padding:12px;font-size:1.05rem}.search button,.primary{border:0;border-radius:10px;background:var(--g);color:#07110a;font-weight:800;padding:0 18px}.status{min-height:42px;padding:12px 2px;color:var(--muted)}.results{display:grid;gap:10px}.book{display:grid;grid-template-columns:68px 1fr auto;gap:14px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(145deg,var(--panel2),var(--panel));}.cover{width:68px;height:98px;object-fit:cover;border-radius:7px;background:#0b130f}.title{font-weight:800}.author,.meta{color:var(--muted);font-size:.85rem;margin-top:4px}.actions{display:flex;flex-direction:column;gap:7px}.actions button{border:1px solid var(--line);background:var(--panel2);color:var(--ink);border-radius:9px;padding:8px 10px}.empty{padding:38px;border:1px dashed var(--line);border-radius:15px;color:var(--muted);text-align:center}dialog{width:min(760px,calc(100vw - 26px));border:1px solid var(--line);border-radius:17px;background:var(--panel);color:var(--ink);padding:0;box-shadow:var(--shadow)}dialog::backdrop{background:#000a}.modal{padding:20px}.modal h2{margin:0 0 12px}.opts{display:grid;gap:8px}.opt{display:flex;gap:10px;justify-content:space-between;align-items:center;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--panel2)}.opt a{color:var(--b);text-decoration:none;font-weight:700}.pill{font-size:.72rem;color:var(--muted)}.close{float:right;border:1px solid var(--line);background:var(--panel2);color:var(--ink);border-radius:9px;padding:7px 10px}@media(max-width:650px){.search{grid-template-columns:1fr}.search button{padding:11px}.book{grid-template-columns:52px 1fr}.cover{width:52px;height:76px}.actions{grid-column:1/-1;flex-direction:row}.actions button{flex:1}}
</style></head><body><main class="shell"><h1><span class="g">Katherine's</span> <span class="b">Stacks</span></h1><p class="sub">Search the shelves without leaving the room.</p><form class="search" id="f"><input id="q" type="search" placeholder="Title, author, ISBN, DOI…" autocomplete="off"><button>Search</button></form><div class="status" id="s">Ready.</div><section class="results" id="r"><div class="empty">Search for something.</div></section></main><dialog id="d"><div class="modal"><button class="close" id="x">Close</button><h2 id="dt">Book</h2><div id="ds"></div><h3>Ways off the shelf</h3><div class="opts" id="do"></div></div></dialog><script>
const $=s=>document.querySelector(s), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=$('#f'),q=$('#q'),s=$('#s'),r=$('#r'),d=$('#d');
f.onsubmit=async e=>{e.preventDefault();const v=q.value.trim();if(!v)return;s.textContent='Searching…';r.innerHTML='';try{const z=await fetch('/api/search?q='+encodeURIComponent(v)).then(x=>x.json());r.innerHTML=(z.results||[]).map(b=>`<article class="book">${b.cover?`<img class="cover" src="${esc(b.cover)}" alt="">`:'<div class="cover"></div>'}<div><div class="title">${esc(b.title)}</div><div class="author">${esc(b.author||'Unknown author')}</div><div class="meta">${esc([b.format&&b.format.toUpperCase(),b.meta].filter(Boolean).join(' · '))}</div></div><div class="actions"><button onclick="inspect('${b.id}')">Inspect</button></div></article>`).join('')||'<div class="empty">No records found.</div>';s.textContent=`${(z.results||[]).length} results`; }catch(e){s.textContent=e.message;r.innerHTML='<div class="empty">Could not reach the catalog.</div>'}};
async function inspect(id){d.showModal();$('#dt').textContent='Loading…';$('#ds').innerHTML='';$('#do').innerHTML='';try{const [b,o]=await Promise.all([fetch('/api/book/'+id).then(x=>x.json()),fetch('/api/options/'+id).then(x=>x.json())]);$('#dt').textContent=b.title||o.title||'Book';$('#ds').innerHTML=(b.summary||[]).slice(0,4).map(t=>`<p>${esc(t)}</p>`).join('');$('#do').innerHTML=(o.options||[]).map((x,i)=>`<div class="opt"><div><a target="_blank" rel="noopener" href="${esc(x.url)}">${esc(x.label||('Option '+(i+1)))}</a><div class="pill">${esc(x.kind)} · ${esc(x.host)}</div></div></div>`).join('')||'<div class="empty">No acquisition options were exposed on this record.</div>'; }catch(e){$('#dt').textContent='Could not inspect record';$('#ds').textContent=e.message}}
$('#x').onclick=()=>d.close();window.inspect=inspect;
</script></body></html>'''


class Handler(BaseHTTPRequestHandler):
    server_version = "KatherinesStacks/0.2"

    def log_message(self, fmt, *args):
        print("[Stacks] " + (fmt % args))

    def json(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def html(self):
        raw = UI.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        try:
            if p.path in ("/", "/index.html"):
                return self.html()
            if p.path == "/api/status":
                return self.json({"ok": True, "name": APP_NAME, "version": VERSION})
            if p.path == "/api/search":
                qs = urllib.parse.parse_qs(p.query)
                query = (qs.get("q") or [""])[0]
                limit = int((qs.get("limit") or ["40"])[0])
                return self.json(search(query, max(1, min(80, limit))))
            m = re.fullmatch(r"/api/book/([0-9a-fA-F]{32})", p.path)
            if m:
                return self.json(record(m.group(1)))
            m = re.fullmatch(r"/api/options/([0-9a-fA-F]{32})", p.path)
            if m:
                return self.json(options(m.group(1)))
            self.send_error(404)
        except ValueError as exc:
            self.json({"error": str(exc)}, 400)
        except Exception as exc:
            self.json({"error": str(exc)}, 502)


def dump(value):
    print(json.dumps(value, indent=2, ensure_ascii=False))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="katherines_stacks.py", description=APP_NAME)
    sub = ap.add_subparsers(dest="command")
    sp = sub.add_parser("serve", help="run the local web UI and JSON API")
    sp.add_argument("--host", default=DEFAULT_HOST)
    sp.add_argument("--port", type=int, default=DEFAULT_PORT)
    sp.add_argument("--no-open", action="store_true")
    sp = sub.add_parser("search", help="search the catalog and print JSON")
    sp.add_argument("query")
    sp.add_argument("--limit", type=int, default=40)
    sp = sub.add_parser("book", help="inspect one record and print JSON")
    sp.add_argument("id")
    sp = sub.add_parser("options", help="list acquisition choices for one record")
    sp.add_argument("id")
    args = ap.parse_args(argv)

    if args.command == "search":
        return dump(search(args.query, max(1, min(80, args.limit))))
    if args.command == "book":
        return dump(record(args.id))
    if args.command == "options":
        return dump(options(args.id))

    host = getattr(args, "host", DEFAULT_HOST)
    port = getattr(args, "port", DEFAULT_PORT)
    no_open = getattr(args, "no_open", False)
    url = f"http://{host}:{port}/"
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"{APP_NAME} {VERSION}: {url}")
    if not no_open and host in {"127.0.0.1", "localhost"}:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
