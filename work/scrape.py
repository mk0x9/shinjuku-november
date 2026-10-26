# Per-property scraper: detail page + Nov 15 plan list + plan details for every id in data/inside.json.
# Run one worker per shard, each in its own background tab (sandbox disabled):
#   SHARD=0/10 browser-use < scrape.py      (optional LIMIT=n for a smoke test)
# Resumable: data/props/<yadNo>.json is skipped when present.
exec(open("/Users/mikhail/code/shinjuku-november/work/jalan_lib.py").read())
import os, time

WORK = "/Users/mikhail/code/shinjuku-november/work"
LIMIT = int(os.environ.get("LIMIT", "0"))
SHARD, NSHARDS = map(int, os.environ.get("SHARD", "0/1").split("/"))
os.makedirs(f"{WORK}/data/props", exist_ok=True)
logf = open(f"{WORK}/data/scrape_{SHARD}.log", "a")


def log(msg):
    logf.write(time.strftime("%H:%M:%S ") + msg + "\n"); logf.flush()


cands = json.load(open(f"{WORK}/data/candidates.json"))
todo = json.load(open(f"{WORK}/data/inside.json"))[SHARD::NSHARDS]
if LIMIT:
    todo = todo[:LIMIT]
tab = Tab()
try:
    tab.goto("https://www.jalan.net/130000/")
    fails = 0
    for i, y in enumerate(todo):
        path = f"{WORK}/data/props/{y}.json"
        if os.path.exists(path):
            continue
        for attempt in range(3):
            try:
                t0 = time.time()
                p = scrape_property(tab, y)
                if p["blocked"]:
                    raise RuntimeError("blocked")
                p["search"] = cands[y]
                json.dump(p, open(path, "w"), ensure_ascii=False)
                log(f"[{i + 1}/{len(todo)}] {y} plans={len(p['plans'])} "
                    f"listCount={p['planListCount']} {time.time() - t0:.1f}s")
                fails = 0
                break
            except Exception as e:
                fails += 1
                log(f"[{i + 1}/{len(todo)}] {y} attempt {attempt + 1} failed: {str(e)[:200]}")
                time.sleep(45 * (attempt + 1))
        if fails >= 6:
            log("too many consecutive failures, stopping"); break
    log("DONE")
finally:
    tab.close()
