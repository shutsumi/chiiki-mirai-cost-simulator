#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公開サイト用の軽量データ(docs/data/schools.json)を生成する。
入力: data/schools_cost_data.json, data/meal_provision.json, data/fee_details.json, data/school_kana.json
(fee_details.json は scripts/parse_fee_detail.py で生成)
"""
import json, os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
schools = json.load(open(os.path.join(BASE, "data", "schools_cost_data.json"), encoding="utf-8"))
meals = json.load(open(os.path.join(BASE, "data", "meal_provision.json"), encoding="utf-8"))
details = json.load(open(os.path.join(BASE, "data", "fee_details.json"), encoding="utf-8"))
kana = json.load(open(os.path.join(BASE, "data", "school_kana.json"), encoding="utf-8"))  # scripts/school_kana.py で生成

def positive_or_none(v):
    return v if isinstance(v, int) and v > 0 else None

out = []
for s in schools:
    m = meals[s["id"]]
    out.append({
        "id": s["id"],
        "name": s["name"],
        "pref": s["prefecture"],
        "label": kana[s["id"]]["label"], "kana": kana[s["id"]]["kana"],   # プルダウン用の表示名・読みがな
        "firstYear": positive_or_none(s["first_year_cost"]["total"]),   # None = 未掲載・調整中
        "monthly": positive_or_none(s["monthly_living_cost"]["total"]),  # None = 未掲載・調整中
        "fyItems": details[s["id"]]["firstYearItems"],   # 初年度の費用: 項目名(入学時の費用として表示)
        # 初年度の費用の金額(授業料・修学旅行積立金・学校諸費を月割りにするために使う)
        "fy": {b["label"]: b["amount"] for b in s["first_year_cost"]["breakdown"]
               if b["label"] in details[s["id"]]["firstYearItems"] and isinstance(b["amount"], int) and b["amount"] > 0},
        "fyNotes": details[s["id"]].get("firstYearNotes", ""),   # 学校ページの補足(町の補助など)
        "living": details[s["id"]]["living"],             # 月々の生活費: サイトの明細をそのまま表示
        "housing": list(dict.fromkeys(v["housing_type"] for v in s["housing_variants"] if v["housing_type"] != "集団")),
        "meal": {"status": m["status"], "provided": m["provided_per_month"], "label": m["label"]},
    })
os.makedirs(os.path.join(BASE, "docs", "data"), exist_ok=True)
json.dump(out, open(os.path.join(BASE, "docs", "data", "schools.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print("schools:", len(out), "/ firstYear未掲載:", sum(1 for o in out if o["firstYear"] is None),
      "/ monthly未掲載:", sum(1 for o in out if o["monthly"] is None))
