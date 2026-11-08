"""各校の「学費・生活費」ブロック(raw_fee_block)から、表示用の明細を取り出す。

公式サイトの各校ページの「学費・生活費」は、次の並びになっている(2026年9月29日時点):
  入学初年度の経費等 … 項目名＋金額 が並び、「合計」、その後に注記
  生活費              … 項目名＋金額(住居費の下に「食費込み」などのバッジ)、
                         「自治体からの補助」には説明文が付くことがある、「合計」、その後に注記
raw_fee_block はこれをつなげた文字列なので、項目名・金額・バッジ・注記に切り分ける。

出力: data/fee_details.json
  {id: {"firstYearItems": [項目名...], "firstYearNotes": str,
        "living": {"items": [{"label","value","badges":[...],"desc"}], "total": "62,700円", "notes": str}}}
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AMOUNT = r"(?:-?[\d,，]+|-)円"
BADGES = ["食費込み", "光熱費込み", "インターネット代込み"]
LIVING_KNOWN = ["住居費（月額/円）", "食費（月額/円）", "光熱費（月額/円）",
                "インターネット代（月額/円）", "自治体からの補助（月額/円）"]
SUBSIDY = "自治体からの補助（月額/円）"
TOTAL_RE = re.compile(r"合計(" + AMOUNT + ")")
ITEM_RE = re.compile(r"(.*?)(" + AMOUNT + ")", re.S)


def parse_first_year(text):
    m = TOTAL_RE.search(text)
    body, notes = (text[:m.start()], text[m.end():]) if m else (text, "")
    items = []
    for label, _amount in ITEM_RE.findall(body):
        label = label.strip()
        if label:
            items.append(label)
    return items, notes.strip()


def parse_living(text):
    items, pos = [], 0
    total, notes = None, ""
    known_or_total = re.compile("|".join(map(re.escape, LIVING_KNOWN)) + r"|合計" + AMOUNT)
    while pos < len(text):
        rest = text[pos:]
        badge = next((b for b in BADGES if rest.startswith(b)), None)
        if badge:
            if items:
                items[-1]["badges"].append(badge)
            pos += len(badge)
            continue
        m = TOTAL_RE.match(rest)
        if m:
            total = m.group(1)
            notes = rest[m.end():].strip()
            break
        m = ITEM_RE.match(rest)
        if not m:            # 金額がもう出てこない(合計なし)
            notes = rest.strip()
            break
        label = m.group(1).strip()
        # バッジが項目名の前にくっついている場合(「…込み」＋項目名)
        while True:
            b = next((b for b in BADGES if label.startswith(b)), None)
            if not b:
                break
            if items:
                items[-1]["badges"].append(b)
            label = label[len(b):]
        item = {"label": label, "value": m.group(2), "badges": [], "desc": ""}
        pos += m.end()
        if label == SUBSIDY:
            # 補助の説明文: 次の既知の項目名 or 合計 の手前まで
            nxt = known_or_total.search(text, pos)
            end = nxt.start() if nxt else len(text)
            item["desc"] = text[pos:end].strip()
            pos = end
        if label:            # 項目名が空の「0円」は入力欄の名残なので捨てる
            items.append(item)
    return {"items": items, "total": total, "notes": notes}


def main():
    data = json.loads((ROOT / "data/schools_cost_data.json").read_text())
    out = {}
    for s in data:
        raw = s["raw_fee_block"].split("居住タイプ")[0]
        first_total = TOTAL_RE.search(raw)
        cut = raw.find("生活費住居費（月額/円）", first_total.end() if first_total else 0)
        first, living = raw[:cut], raw[cut + len("生活費"):]
        fy_items, fy_notes = parse_first_year(first)
        out[s["id"]] = {
            "firstYearItems": fy_items,
            "firstYearNotes": fy_notes,
            "living": parse_living(living),
        }
    (ROOT / "data/fee_details.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print("schools:", len(out))


if __name__ == "__main__":
    main()
