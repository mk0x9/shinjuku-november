# Tokyo stays: English enrichment task

You turn scraped Jalan (Japanese) data about places to stay near JR Shinjuku, Shibuya, Gotanda or Hamamatsucho station into concise English fields for a map.
The trip: 2 adults, 1 room, night of Nov 15 2026, budget under ¥20,000 total.

## Input
`work/enrich/in/batch_NN.json` is a JSON array of properties. Per property:
- facts: `name`, `catch`, `description`, `access`, `address`, `nearest_station`, `distance_km`, `pr_text`, `facilities`, `services`,
  `onsen`, `bath_notes`, `shared_baths_m_f_mixed` (counts [men, women, mixed] for outdoor/indoor/sauna), `room_counts_...`,
  `rating`, `reviews`, `scores`, `highly_rated`, `review_highlight`, `photo_captions`
- `rooms`: map `roomTypeCd -> {name, labels, style_label, facilities, detail}`
- `plans`: map `planCd -> {name, meal, summary, detail}`

## Output
For each input file write `work/enrich/out/<same file name>`: a JSON array, one object per input property, same order:

```json
{
  "yadNo": "343909",
  "name_en": "Hotel Sunlite Shinjuku",
  "type": "business_hotel",
  "type_note": "Short note only when useful, e.g. 'Love hotel also taking regular stays' or 'Capsule hotel, separate male/female floors', else ''",
  "summary_en": "One sentence: what the place is and where, e.g. 'Mid-size business hotel in Shinjuku 5-chome, 7 min walk from Shinjuku-sanchome'",
  "access_en": "Short walking access, e.g. '5 min walk from Shin-Okubo (JR Yamanote), 3 min from Higashi-Shinjuku (Fukutoshin/Oedo)'",
  "strong_points": ["2-3 short bullets, most distinctive first"],
  "watch_outs": "One short line on downsides the data shows (tiny rooms, shared showers, no elevator, love-hotel district, low cleanliness score...), else ''",
  "review_summary_en": "One sentence from review_highlight / highly_rated / scores, or '' if there are no reviews",
  "photo_captions_en": {"<Japanese caption exactly as in photo_captions>": "Short English caption"},
  "rooms": {
    "<roomTypeCd>": {
      "occupancy": "private | shared",
      "style": "Western | Japanese | Japanese-Western | Capsule | Dorm bed | Other",
      "bedding": "e.g. '1 double bed (140 cm)', '2 single beds', '1 semi-double bed (120 cm)', 'futons', '2 capsules', 'bunk beds', 'unknown'",
      "size": "e.g. '12 m²' or '6 tatami' or ''",
      "bathroom": "private bath & toilet | private shower & toilet | private toilet, shared bath | shared | unknown",
      "smoking": "non-smoking | smoking | unknown",
      "room_en": "One line, e.g. 'Non-smoking double, 12 m², 140 cm bed, unit bath'"
    }
  },
  "plans": {
    "<planCd>": {
      "plan_name_en": "Short English plan name, e.g. 'Room only, online prepayment'",
      "meals": "Room only | Breakfast | Breakfast & dinner | Dinner only",
      "breakfast_en": "Short description if breakfast is included (buffet, Japanese set...), else ''",
      "notes_en": "Short conditions that matter for booking, e.g. 'Non-refundable, prepaid online', '2 capsules, one per guest, men and women on separate floors', '1-night limit', else ''"
    }
  }
}
```

## Rules
- Use only the given data, never invent facts. Use `unknown` or `''` when the data does not say.
- `type` is one of: `business_hotel`, `city_hotel` (full-service, restaurants, large), `capsule_hotel`, `hostel`,
  `leisure_hotel` (love hotel / レジャーホテル / ラブホテル / "休憩" rates), `ryokan`, `guesthouse`, `apartment` (apartment hotel, whole flat), `other`.
- `occupancy`: `shared` for capsules, pods, dorm beds and anything where the two guests sleep in a shared space with other guests
  (also two separate capsules); `private` for a lockable room for the two of you, even if the bathroom is shared.
- Bedding: セミダブル = semi-double (about 120-140 cm, a tight fit for two); ダブル = double; ツイン = two beds; 和室 without beds = futons.
  Give the width when the text gives it.
- Bathroom: ユニットバス/バス・トイレ付 = private bath & toilet; シャワーのみ/シャワールーム = private shower & toilet; 共同 = shared.
  "※バスなしトイレなし" = shared.
- Write names in normal English title case. Romanise Japanese names (Hepburn) and translate generic words (ホテル = Hotel).
  Keep official English names when the Japanese name is already in Latin letters (convert full-width letters to normal ones).
- `strong_points` and `watch_outs` describe the property as a whole, not a single plan.
- Keep English short and factual. Write valid JSON (UTF-8), no markdown wrapper.
- When done, run `python3 work/enrich/validate.py work/enrich/in/<file> work/enrich/out/<file>` from the repo root and fix any problems it reports.
