/* 自宅から学校までの行き方
 * 都道府県と学校を選ぶと、Googleマップのルート検索(出発地は利用者が入れる)を開くボタンを出す
 * 学校データは費用シミュレーターと共通の ../data/schools.json を使う。利用の記録はしない
 */
(function () {
  "use strict";

  const PREF_ORDER = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
    "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県",
    "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県",
    "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const routeUrl = (s) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(s.name);
  const schoolUrl = (s) => "https://c-mirai.jp/schools/" + encodeURIComponent(s.id);

  let SCHOOLS = [];

  function fillPrefs() {
    const prefs = PREF_ORDER.filter((p) => SCHOOLS.some((s) => s.pref === p));
    $("pref").insertAdjacentHTML("beforeend", prefs.map((p) => {
      const n = SCHOOLS.filter((s) => s.pref === p).length;
      return `<option value="${p}">${p}(${n}校)</option>`;
    }).join(""));
  }

  function fillSchools(pref) {
    const sel = $("school");
    const list = SCHOOLS.filter((s) => s.pref === pref).sort((a, b) => a.kana.localeCompare(b.kana, "ja"));
    sel.innerHTML = pref
      ? `<option value="">学校を選ぶ(${list.length}校)</option>` + list.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("")
      : '<option value="">先に都道府県を選んでください</option>';
    sel.disabled = !pref;
  }

  // 学校を選んだら、その場でボタンを出す(押すボタンを1つにするため、送信ボタンは置かない)
  function showRoute() {
    const s = SCHOOLS.find((x) => x.id === $("school").value);
    $("route-out").hidden = !s;
    if (!s) return;
    $("route-school").textContent = s.name;
    $("route-btn").href = routeUrl(s);
    $("school-link").href = schoolUrl(s);
  }

  async function init() {
    try {
      const res = await fetch("../data/schools.json");
      if (!res.ok) throw new Error(res.status);
      SCHOOLS = await res.json();
    } catch (e) {
      $("sim-form").insertAdjacentHTML("beforeend", '<p class="field-error">学校データを読み込めませんでした、ページを再読み込みしてください</p>');
      return;
    }
    fillPrefs();
    $("pref").addEventListener("change", (e) => { fillSchools(e.target.value); showRoute(); });
    $("school").addEventListener("change", showRoute);
    $("sim-form").addEventListener("submit", (e) => e.preventDefault());
  }

  init();
})();
