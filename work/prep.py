# Post-process scraped properties into data/prepped.json and write compact enrichment inputs
# (enrich/in/batch_NN.json) for the English-text subagents. Run: python3 prep.py
import glob, json, os, re

WORK = os.path.dirname(os.path.abspath(__file__))
BATCH = int(os.environ.get("BATCH", "8"))


def cut(s, n):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[:n] + "…"


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def cancel_info(text):
    """'キャンセル料無料（2026年11月13日まで）' -> ('2026-11-13', rooms left); '予約時よりキャンセル料が発生' -> 'non-refundable'."""
    t = text or ""
    left = re.search(r"あと(\d+)部屋", t)
    m = re.search(r"キャンセル料無料（(\d{4})年(\d{1,2})月(\d{1,2})日まで）", t)
    if m:
        c = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    elif "予約時よりキャンセル料が発生" in t:
        c = "non-refundable"
    else:
        c = None
    return c, int(left.group(1)) if left else None


def own_photos(p, extra):
    """The property's own photos (detail pages also show other properties' thumbnails), 1200px, deduplicated, with captions.
    `extra`: photos collected from the fetched page by photos.py."""
    tag = f"/Y{p['yadNo']}/"
    caps = {}
    for u, a in (p.get("image_captions") or []) + extra:
        if tag in u and a and not caps.get(u):
            caps[u] = a
    out, seen = [], set()
    for u in (p.get("images") or []) + [u for u, _ in extra] + list(caps):
        if tag not in u:
            continue
        big = re.sub(r"/pict\w*?/", "/pict4L/", u, count=1)
        if big not in seen:
            seen.add(big)
            out.append([big, caps.get(u) or caps.get(big, "")])
    return out


def prep_property(p, extra_photos):
    s = p["search"]
    plans = []
    for r in p["plans"]:
        c, left = cancel_info(r.get("cancel"))
        plans.append({
            "planCd": r["planCd"], "roomCd": r["roomTypeCd"], "planName": r["planName"], "meal": r["meal"], "total": r["total"],
            "cancel": c, "roomsLeft": left, "oneNight": bool(re.search(r"最大1泊", r.get("maxNightsNote") or "")),
            "roomName": r.get("roomFullName") or r.get("roomName"), "roomLabels": r.get("roomLabels"), "roomStyle": r.get("roomStyle"),
            "roomDetail": r.get("roomDetail"), "roomFacilities": r.get("roomFacilities"), "planDetail": r.get("planDetail"),
            "planDesc": r.get("planDesc"), "checkInOut": r.get("checkInOut"),
            "roomImages": [u for u, _ in r.get("roomImages") or []], "planImages": [u for u, _ in r.get("planImages") or []],
        })
    plans.sort(key=lambda x: x["total"])
    return {
        "yadNo": p["yadNo"], "name": s["name"], "catch": s.get("catch"), "description": s.get("description"), "access": s.get("access"),
        "address": p.get("address"), "lat": p["coords"][0] if p.get("coords") else s["coords"][0],
        "lng": p["coords"][1] if p.get("coords") else s["coords"][1], "distKm": s["distKm"],
        "rating": num(p.get("rating")) or s.get("rating"), "reviews": p.get("reviews") or s.get("reviews"),
        "scores": {k: num(p.get("r_" + k)) for k in ["room", "bath", "breakfast", "service", "clean"]},
        "highlyRated": p.get("highly_rated") or s.get("highlyRated"), "reviewHighlight": p.get("review_highlight"),
        "prText": p.get("pr_text"), "checkin": (p.get("checkin") or "").strip(), "checkout": (p.get("checkout") or "").strip(),
        "facilities": p.get("facilities"), "services": p.get("services"), "onsen": p.get("onsen"), "bathNotes": p.get("bath_notes"),
        "baths": {k: p.get(k) for k in ["rotenburo_mfx", "indoor_mfx", "sauna_mfx"]}, "roomCounts": p.get("rooms"),
        "parking": p.get("parking"), "photos": own_photos(p, extra_photos.get(p["yadNo"], [])), "plans": plans,
    }


def enrich_input(q):
    rooms, plans = {}, {}
    for r in q["plans"]:
        rooms.setdefault(r["roomCd"], {"name": cut(r["roomName"], 120), "labels": r["roomLabels"], "style_label": r["roomStyle"],
                                       "facilities": cut(r["roomFacilities"], 150), "detail": cut(r["roomDetail"], 600)})
        plans.setdefault(r["planCd"], {"name": cut(r["planName"], 160), "meal": r["meal"], "summary": cut(r["planDesc"], 120),
                                       "detail": cut(r["planDetail"], 700)})
    return {
        "yadNo": q["yadNo"], "name": q["name"], "catch": q["catch"], "description": cut(q["description"], 300),
        "access": cut(q["access"], 200), "address": q["address"], "distance_km_from_jr_shinjuku": q["distKm"],
        "pr_text": cut(q["prText"], 400), "facilities": cut(q["facilities"], 200), "services": cut(q["services"], 150),
        "onsen": q["onsen"], "bath_notes": cut(q["bathNotes"], 200), "shared_baths_m_f_mixed": q["baths"],
        "room_counts_western_japanese_mixed_other_total": q["roomCounts"], "rating": q["rating"], "reviews": q["reviews"],
        "scores": q["scores"], "highly_rated": q["highlyRated"], "review_highlight": cut(q["reviewHighlight"], 300),
        "photo_captions": [a for _, a in q["photos"] if a][:12], "rooms": rooms, "plans": plans,
    }


def main():
    props = [json.load(open(f)) for f in sorted(glob.glob(f"{WORK}/data/props/*.json"))]
    extra = json.load(open(f"{WORK}/data/photos.json")) if os.path.exists(f"{WORK}/data/photos.json") else {}
    prepped = sorted((prep_property(p, extra) for p in props if p["plans"]), key=lambda q: q["distKm"])
    json.dump(prepped, open(f"{WORK}/data/prepped.json", "w"), ensure_ascii=False, indent=1)
    os.makedirs(f"{WORK}/enrich/in", exist_ok=True)
    for f in glob.glob(f"{WORK}/enrich/in/batch_*.json"):
        os.remove(f)
    inputs = [enrich_input(q) for q in prepped]
    for i in range(0, len(inputs), BATCH):
        json.dump(inputs[i:i + BATCH], open(f"{WORK}/enrich/in/batch_{i // BATCH:02d}.json", "w"), ensure_ascii=False, indent=1)
    print(f"properties={len(prepped)} plans={sum(len(q['plans']) for q in prepped)} batches={(len(inputs) + BATCH - 1) // BATCH} "
          f"photos={sum(len(q['photos']) for q in prepped)} price={min(r['total'] for q in prepped for r in q['plans'])}-"
          f"{max(r['total'] for q in prepped for r in q['plans'])}")


if __name__ == "__main__":
    main()
