# Collect each property's own photos (src + alt) from its fetched Jalan page; the navigated detail page sometimes
# hasn't rendered them yet. Run (sandbox disabled): browser-use < photos.py   ->  data/photos.json {yadNo: [[url, caption], ...]}
exec(open("/Users/mikhail/code/shinjuku-november/work/jalan_lib.py").read())
import html as htmllib, os

WORK = "/Users/mikhail/code/shinjuku-november/work"
out = json.load(open(f"{WORK}/data/photos.json")) if os.path.exists(f"{WORK}/data/photos.json") else {}
ids = [y for y in json.load(open(f"{WORK}/data/inside.json")) if y not in out]
tab = Tab()
try:
    tab.goto("https://www.jalan.net/130000/")
    for y, r in zip(ids, fetch_many(tab, [f"https://www.jalan.net/yad{y}/" for y in ids], 4)):
        if r.get("status") != 200:
            print("failed", y, r.get("status")); continue
        seen, photos = set(), []
        for tag in re.findall(r"<img\b[^>]*>", r["html"]):
            m = re.search(r'(?:data-src|src)="(https?://cdn\.jalan\.jp/jalan/images/pict\w*/Y\d+/Y%s/[^"]+)"' % y, tag)
            if not m:
                continue
            key = re.sub(r"/pict\w*/", "/", m.group(1))
            alt = re.search(r'alt="([^"]*)"', tag)
            alt = htmllib.unescape(alt.group(1)).strip() if alt else ""
            if key in seen:
                if alt:
                    for p in photos:
                        if re.sub(r"/pict\w*/", "/", p[0]) == key and not p[1]:
                            p[1] = alt
                continue
            seen.add(key)
            photos.append([re.sub(r"/pict\w*/", "/pict4L/", m.group(1), count=1), alt])
        out[y] = photos
finally:
    tab.close()
json.dump(out, open(f"{WORK}/data/photos.json", "w"), ensure_ascii=False, indent=1)
print({y: len(out[y]) for y in ids if y in out})
