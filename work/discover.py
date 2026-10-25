# Discovery: search every nearby Jalan small area for Nov 15 (1 night, 2 adults, maxPrice 20000), fetch each
# candidate's coordinates from its Jalan page, keep those within RADIUS_KM of JR Shinjuku station.
# Run (sandbox disabled):  browser-use < discover.py
# Output: data/candidates.json (all, with coords + distance), data/inside.json (ids within the radius)
exec(open("/Users/mikhail/code/shinjuku-november/work/jalan_lib.py").read())
import math, os, time

WORK = "/Users/mikhail/code/shinjuku-november/work"
STATION = (35.6896, 139.7006)
RADIUS_KM = 2.0
AREAS = {  # Tokyo small areas that touch the 2 km circle (Ikebukuro as a safety margin for Takadanobaba/Mejiro)
    "LRG_138000/SML_138002": "新宿", "LRG_138000/SML_138005": "中野・杉並", "LRG_138300/SML_138302": "渋谷",
    "LRG_136800/SML_136808": "青山", "LRG_136500/SML_136505": "九段・四谷・後楽園", "LRG_137700/SML_137702": "池袋",
    # Whole large areas (catch properties not filed under a small area) and Jalan's Shinjuku-station search
    "LRG_138000": "新宿・中野・杉並・吉祥寺", "LRG_138300": "渋谷・目黒・世田谷", "LRG_136800": "六本木・麻布・赤坂・青山",
    "LRG_136500": "お茶の水・湯島・九段・後楽園", "LRG_137700": "池袋・目白・板橋・赤羽", "STA_990377": "新宿駅",
}
CENTER = re.compile(r"center=(-?[\d.]+)(?:,|%2C)(-?[\d.]+)")


def dist_km(lat, lng):
    la1, lo1, la2, lo2 = map(math.radians, (*STATION, lat, lng))
    a = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(a))


os.makedirs(f"{WORK}/data", exist_ok=True)
cand_path = f"{WORK}/data/candidates.json"
cands = json.load(open(cand_path)) if os.path.exists(cand_path) else {}
tab = Tab()
try:
    tab.goto("https://www.jalan.net/130000/")
    searched = {a for c in cands.values() for a in c["areas"]}
    if set(AREAS) - searched:
        pending, retries = [(a, 1) for a in AREAS if a not in searched], {}
        while pending:
            batch, pending = pending[:8], pending[8:]
            # Station searches only answer with distCd=02
            urls = [search_url("130000", a, page=p).replace("distCd=01", "distCd=02" if a.startswith("STA_") else "distCd=01")
                    for a, p in batch]
            res = parse_fetch(tab, urls, "searchlist", conc=3)
            for (a, p), r in zip(batch, res):
                d = r.get("data") or {}
                if r.get("blocked") or r.get("status") != 200:
                    print("search error", r.get("status"), r["url"], flush=True)
                    retries[(a, p)] = retries.get((a, p), 0) + 1
                    if retries[(a, p)] < 3:
                        pending.append((a, p)); time.sleep(10)
                    continue
                if p == 1:
                    print(a, AREAS[a], "count", d.get("count"), flush=True)
                    pending += [(a, q) for q in range(2, math.ceil((d.get("count") or 0) / 30) + 1)]
                for it in d.get("items", []):
                    if it["yadNo"]:
                        c = cands.setdefault(it["yadNo"], {**it, "areas": []})
                        if a not in c["areas"]:
                            c["areas"].append(a)
        json.dump(cands, open(cand_path, "w"), ensure_ascii=False)
        print("candidates", len(cands))
    todo = [y for y, c in cands.items() if "coords" not in c]
    for b in range(0, len(todo), 40):
        ids = todo[b:b + 40]
        res = fetch_many(tab, [f"https://www.jalan.net/yad{y}/" for y in ids], 5)
        for y, r in zip(ids, res):
            html = r.get("html") or ""
            if r.get("status") != 200 or re.search(r"エラー画面|アクセスが集中", html[:3000]):
                continue
            m = CENTER.search(html)
            cands[y]["coords"] = [float(m.group(1)), float(m.group(2))] if m else None
            cands[y]["distKm"] = round(dist_km(*cands[y]["coords"]), 3) if m else None
        json.dump(cands, open(cand_path, "w"), ensure_ascii=False)
        print(f"coords batch {b // 40}: {sum('coords' in cands[y] for y in ids)}/{len(ids)}")
finally:
    tab.close()
inside = sorted((y for y, c in cands.items() if c.get("distKm") is not None and c["distKm"] <= RADIUS_KM),
                key=lambda y: cands[y]["distKm"])
json.dump(inside, open(f"{WORK}/data/inside.json", "w"))
print("inside", len(inside), "no coords", [y for y, c in cands.items() if not c.get("coords")])
