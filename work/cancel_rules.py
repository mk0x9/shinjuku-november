# Plans without a "キャンセル料無料（…まで）" label: read the キャンセル規定 table on the plan page and store the
# rule in data/props/<id>.json as plan["cancelRule"] (e.g. "1日前 宿泊料金の50% 当日 宿泊料金の100%").
# prep.py derives the last free-cancellation day from it. Run (sandbox disabled): browser-use < cancel_rules.py
exec(open("/Users/mikhail/code/shinjuku-november/work/jalan_lib.py").read())
import glob, html as htmllib

WORK = "/Users/mikhail/code/shinjuku-november/work"
todo = []
for f in sorted(glob.glob(f"{WORK}/data/props/*.json")):
    p = json.load(open(f))
    for i, r in enumerate(p["plans"]):
        c = r.get("cancel") or ""
        if "cancelRule" not in r and "キャンセル料無料" not in c and "予約時よりキャンセル料" not in c:
            todo.append((f, i, r["url"]))
print("plans without a cancel label", len(todo))


def rule(page):
    t = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", page)))
    m = re.search(r"キャンセル規定 キャンセルについて(.*?)(?:補足|の基本情報|ページの先頭)", t)
    return m.group(1).strip() if m else None


tab = Tab()
try:
    tab.goto("https://www.jalan.net/130000/")
    found = {}
    for b in range(0, len(todo), 20):
        chunk = todo[b:b + 20]
        for (f, i, u), r in zip(chunk, fetch_many(tab, [u for _, _, u in chunk], 3)):
            if r.get("status") == 200:
                found[(f, i)] = rule(r["html"])
        print(f"{b + len(chunk)}/{len(todo)}", flush=True)
finally:
    tab.close()
for f in {f for f, _ in found}:
    p = json.load(open(f))
    for (g, i), v in found.items():
        if g == f:
            p["plans"][i]["cancelRule"] = v
    json.dump(p, open(f, "w"), ensure_ascii=False)
print("rules", sum(v is not None for v in found.values()), "missing", sum(v is None for v in found.values()), "failed", len(todo) - len(found))
