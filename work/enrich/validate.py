# Check an enrichment output file against its input. Usage: python3 validate.py <input.json> <output.json>
import json, sys

ENUMS = {
    "type": {"business_hotel", "city_hotel", "capsule_hotel", "hostel", "leisure_hotel", "ryokan", "guesthouse", "apartment", "other"},
    "occupancy": {"private", "shared"},
    "style": {"Western", "Japanese", "Japanese-Western", "Capsule", "Dorm bed", "Other"},
    "bathroom": {"private bath & toilet", "private shower & toilet", "private toilet, shared bath", "shared", "unknown"},
    "smoking": {"non-smoking", "smoking", "unknown"},
    "meals": {"Room only", "Breakfast", "Breakfast & dinner", "Dinner only"},
}

inp = json.load(open(sys.argv[1]))
try:
    out = json.load(open(sys.argv[2]))
except Exception as e:
    sys.exit(f"INVALID JSON: {e}")
problems = []
by_id = {str(o.get("yadNo")): o for o in out}
for p in inp:
    o = by_id.get(str(p["yadNo"]))
    if not o:
        problems.append(f"{p['yadNo']}: missing property"); continue
    if o.get("type") not in ENUMS["type"]:
        problems.append(f"{p['yadNo']}: bad type {o.get('type')!r}")
    for k in ("name_en", "summary_en", "strong_points"):
        if not o.get(k):
            problems.append(f"{p['yadNo']}: missing {k}")
    for rc in p["rooms"]:
        r = (o.get("rooms") or {}).get(rc)
        if not r:
            problems.append(f"{p['yadNo']}: missing room {rc}"); continue
        for k in ("occupancy", "style", "bathroom", "smoking"):
            if r.get(k) not in ENUMS[k]:
                problems.append(f"{p['yadNo']} room {rc}: bad {k} {r.get(k)!r}")
        if not r.get("room_en") or not r.get("bedding"):
            problems.append(f"{p['yadNo']} room {rc}: missing room_en or bedding")
    for pc in p["plans"]:
        q = (o.get("plans") or {}).get(pc)
        if not q:
            problems.append(f"{p['yadNo']}: missing plan {pc}"); continue
        if q.get("meals") not in ENUMS["meals"]:
            problems.append(f"{p['yadNo']} plan {pc}: bad meals {q.get('meals')!r}")
        if not q.get("plan_name_en"):
            problems.append(f"{p['yadNo']} plan {pc}: missing plan_name_en")
if problems:
    print("\n".join(problems[:40])); sys.exit(1)
print(f"ok {len(inp)} properties")
