/* 地域みらい留学費用シミュレーター
 * 志望校を1校選ぶと、入学後に「毎月かかる費用」「入学のときにかかる費用」「年に何回かかかる費用」の目安を出す
 * 金額はすべて目安、入学時・ときどきの費用まで足した総額は出さない(2026-10〜11月の座談会・打ち合わせで決めた方針)
 * 毎月かかる費用だけは合計を出す(2026-11-19 内海の判断、合計がないとわかりづらいため)
 * 計算の前提は README.md の「計算ロジック」を参照
 */
(function () {
  "use strict";

  // -------------------------------------------------------------------------
  // 計算の前提
  // -------------------------------------------------------------------------
  const AFTER = {
    POCKET_BASE: 10000,  // お小遣いの目安(月)
    MEAL_LOW: 300,       // 出ない食事1食の想定額(自炊)
    MEAL_HIGH: 750,      // 出ない食事1食の想定額(自炊300円と外食1,200円の中間。ときどき外食する想定)
    MEALS_PER_MONTH: 90, // 30日×3食
  };
  // 初年度の費用のうち、毎月(分割)で払うことが多い項目と、月割りの考え方
  //   授業料: 年額を12か月で割る(学校ページに月額で載っている学校もあるため、2万円未満は月額とみなす)
  //   修学旅行積立金: 積立の期間が学校によって違うため、36か月〜24か月で割った幅で出す
  //   学校諸費: 年額を12か月で割る
  const MONTHLY_ITEMS = ["授業料", "修学旅行積立金", "学校諸費"];

  const PREF_ORDER = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
    "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県",
    "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県",
    "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

  // -------------------------------------------------------------------------
  // 計算(純粋関数)
  // -------------------------------------------------------------------------
  function missedMeals(meal) {
    if (meal.status === "known" || meal.status === "none") return Math.max(0, AFTER.MEALS_PER_MONTH - (meal.provided || 0));
    return null; // in_cost(生活費に含まれる) / unknown(不明) は計算しない
  }

  // 学校に払う費用の月割り。[{label, low, high, note}]
  function schoolMonthly(fy) {
    const out = [];
    const tuition = fy["授業料"];
    if (tuition) {
      const m = tuition < 20000 ? tuition : tuition / 12;
      out.push({ label: "授業料", low: m, high: m, tuition: true });
    }
    const trip = fy["修学旅行積立金"];
    if (trip) out.push({ label: "修学旅行積立金", low: trip / 36, high: trip / 24 });
    const misc = fy["学校諸費"];
    if (misc) out.push({ label: "学校諸費", low: misc / 12, high: misc / 12 });
    return out;
  }

  function calc(school) {
    const missed = missedMeals(school.meal);
    return {
      school,
      missed,
      mealLow: missed == null ? null : missed * AFTER.MEAL_LOW,
      mealHigh: missed == null ? null : missed * AFTER.MEAL_HIGH,
      schoolMonthly: schoolMonthly(school.fy || {}),
    };
  }

  // -------------------------------------------------------------------------
  // 表示ユーティリティ
  // -------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const round100 = (n) => Math.round(n / 100) * 100;
  const fmt = (n) => Math.round(n).toLocaleString("ja-JP");
  const yen = (n) => "￥" + fmt(n);
  const range = (lo, hi) => (round100(lo) === round100(hi) ? `${yen(round100(lo))}〜` : `${yen(round100(lo))}〜${yen(round100(hi))}`);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const schoolUrl = (id) => "https://c-mirai.jp/schools/" + encodeURIComponent(id);
  const routeUrl = (s) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(s.name);
  const ASK = '<span class="ask">学校へお問い合わせください</span>';

  function row(label, valueHtml, sub, cls) {
    return `<div class="row${cls ? " " + cls : ""}"><dt>${label}</dt><dd>${valueHtml}</dd>${sub ? `<p class="row-sub">${sub}</p>` : ""}</div>`;
  }
  const perMonth = '<span class="unit">/月</span>';

  // -------------------------------------------------------------------------
  // 入力内容の記録(Googleスプレッドシート / Google Apps Script)
  // config.js の logEndpoint にウェブアプリのURLが設定されているときだけ送信する。個人を特定できる情報は送らない
  // -------------------------------------------------------------------------
  const LOG_ENDPOINT = (window.SIM_CONFIG && window.SIM_CONFIG.logEndpoint) || "";
  const SESSION_ID = Math.random().toString(36).slice(2, 10);

  function logUsage(payload) {
    if (!LOG_ENDPOINT) return;
    try {
      fetch(LOG_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, session: SESSION_ID, page: location.hostname }),
      }).catch(() => {});
    } catch (e) { /* 記録の失敗は結果の表示に影響させない */ }
  }

  // -------------------------------------------------------------------------
  // 結果の表示
  // -------------------------------------------------------------------------
  function livingRow(s) {
    if (s.monthly == null) return row("寮費・生活費", ASK, "公表資料に金額の掲載がありません");
    const lv = s.living;
    const badges = [...new Set(lv.items.flatMap((it) => it.badges))];
    const subs = [];
    if (badges.length) subs.push(`<span class="badges">${badges.map((b) => `<span class="badge">${esc(b)}</span>`).join("")}</span>`);
    if (s.housing && s.housing.length) subs.push(`住まいの種類：${s.housing.map(esc).join("・")}`);
    subs.push("学校ページの金額です、住まいの種類や年度によって変わります");
    const detailRows = lv.items.map((it) => `<li><span>${esc(it.label.replace(/（月額\/円）/, ""))}</span><span>${esc(it.value === "-円" ? "－" : it.value)}</span>${it.desc ? `<small>${esc(it.desc)}</small>` : ""}</li>`).join("");
    const details = `<details class="more"><summary>内訳を見る</summary><ul class="more-list">${detailRows}</ul>${lv.notes ? `<p class="detail-note">${esc(lv.notes)}</p>` : ""}</details>`;
    return row("寮費・生活費", `${yen(s.monthly)}〜${perMonth}`, subs.join("<br>") + details);
  }

  // 食事が出ない日の食費・お小遣い等: 家庭や生徒で大きく変わるため金額は出さず「任意」とする(2026-11-19 内海の判断)
  function extraRow(r) {
    const meal = r.school.meal;
    let mealNote;
    if (meal.status === "in_cost") mealNote = "自炊などの食費は、寮費・生活費に含まれています";
    else if (r.missed == null) mealNote = "食事が出る日は、学校へお問い合わせください";
    else if (r.missed === 0) mealNote = "食事が出ない日は各自で対応します、詳細は学校/自治体へお問い合わせください";
    else mealNote = `食事の提供：${esc(meal.label)}`;
    return row("食事が出ない日の食費・お小遣い等", `<span class="ask">任意</span>${perMonth}`,
      `${mealNote}<br>ご家庭や生徒によって変わるため、合計には含めていません`);
  }



  function schoolMonthlyRows(r) {
    return r.schoolMonthly.map((m) => {
      if (m.tuition) {
        return row("授業料", `<span class="zero">実質￥0</span>`,
          `月${fmt(m.low)}円ですが、国の「高等学校等就学支援金」を申請すると実質0円になります<br><strong>入学後に申請が必要です</strong>(学校から案内があります)`);
      }
      const sub = m.label === "修学旅行積立金"
        ? `${yen(r.school.fy[m.label])}を24〜36か月で積み立てた場合の目安です<br>積立の期間や一括払いかどうかは学校によって違います`
        : `年額${yen(r.school.fy[m.label])}を12か月で割った目安です`;
      return row(m.label, `${range(m.low, m.high)}${perMonth}`, sub);
    }).join("");
  }

  // 毎月かかる費用の合計 = 寮費・生活費＋学校に払う費用の月割り
  // 食事が出ない日の食費・お小遣いは家庭や生徒で大きく変わるため足さない(2026-11-19 内海の判断)
  // 授業料は就学支援金で実質0円として足さない
  function monthlyTotal(r) {
    const s = r.school;
    if (s.monthly == null) return null;
    let lo = s.monthly, hi = lo;
    r.schoolMonthly.filter((m) => !m.tuition).forEach((m) => { lo += m.low; hi += m.high; });
    return { lo, hi };
  }

  function totalBox(r) {
    const t = monthlyTotal(r);
    if (!t) {
      return `<div class="total-box is-na"><p class="total-label">毎月の合計</p><p class="total-na">寮費・生活費の金額が公表されていないため、合計は出せません</p></div>`;
    }
    const hasSchool = r.schoolMonthly.some((m) => !m.tuition);
    const notes = [hasSchool ? "寮費・生活費＋学校に払う費用の月割りの合計です" : "寮費・生活費の金額です"];
    if (r.schoolMonthly.some((m) => m.tuition)) notes.push("授業料は、就学支援金で実質0円として計算しています");
    notes.push("住まいの種類や年度によって、金額は上下することがあります");
    notes.push("このほか、食事が出ない日の食費・お小遣い等が別途かかる可能性があります");
    return `<div class="total-box">
            <p class="total-label">毎月の合計</p>
            <p class="total-value">${range(t.lo, t.hi)}<span class="unit">/月</span></p>
            <ul class="total-notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>
          </div>`;
  }

  function render(r) {
    const s = r.school;
    const onceItems = (s.fyItems || []).filter((t) => !MONTHLY_ITEMS.includes(t));
    const checklist = [];
    if (s.monthly == null) checklist.push("寮費・生活費の金額");
    if (s.meal.status === "unknown") checklist.push("食事が出る曜日と、1日に何食出るか");
    if (s.housing && s.housing.length > 1) checklist.push(`住まいの種類(${s.housing.join("・")})ごとの費用`);
    checklist.push("自治体からの補助(帰省費・寮費など)があるか");
    checklist.push("入学のときにかかる費用の支払い時期");

    $("result").innerHTML = `
      <article class="school-block">
        <h3 class="school-name">${esc(s.name)}</h3>
        <p class="school-meta"><a href="${schoolUrl(s.id)}" target="_blank" rel="noopener">学校ページを見る →</a></p>

        <section class="cost-section">
          <h4><span class="cost-tag is-monthly">毎月</span>毎月かかる費用の目安</h4>
          ${totalBox(r)}
          <dl class="rows">
            ${livingRow(s)}
          </dl>
          ${r.schoolMonthly.length ? `
          <h5>学校に払う費用(月割り)</h5>
          <dl class="rows">${schoolMonthlyRows(r)}</dl>` : ""}
          <h5>別途かかる可能性がある費用</h5>
          <dl class="rows">
            ${extraRow(r)}
          </dl>
        </section>

        <section class="cost-section">
          <h4><span class="cost-tag is-once">最初だけ</span>入学のときにかかる費用</h4>
          <ul class="item-tags">${onceItems.map((t) => `<li>${esc(t)}</li>`).join("")}<li>家具・家電</li><li>引っ越し</li></ul>
          <p class="detail-lead">金額は<a href="${schoolUrl(s.id)}" target="_blank" rel="noopener">学校ページ</a>でご確認ください<br>支払いの時期は、合格後に学校から案内があります</p>
        </section>

        <section class="cost-section">
          <h4><span class="cost-tag is-sometimes">年に何回か</span>ときどきかかる費用</h4>
          <dl class="rows">
            ${row("帰省の交通費", '<span class="ask">帰省1回ごと</span>', `GW・夏休み・冬休み・春休みなど、帰省する回数の分だけかかります<a class="route-btn" href="${routeUrl(s)}" target="_blank" rel="noopener"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg><span>自宅からの行き方と運賃を調べる<small>Googleマップが開きます</small></span></a>`)}
            ${row("部活の遠征・行事", '<span class="ask">学校による</span>', "部活の遠征費や、修学旅行の積立以外の費用など")}
            ${row("冬の光熱費", '<span class="ask">地域による</span>', "寒い地域では、冬に暖房代が上がることがあります")}
          </dl>
        </section>
      </article>

      <section class="info-box is-good">
        <h4>費用が下がるかもしれない情報</h4>
        <ul>
          <li>授業料は、国の就学支援金の申請で実質0円になります</li>
          <li>町や村から、寮費・帰省費・入学準備などの補助が出る学校があります</li>
          ${s.fyNotes ? `<li class="school-note"><strong>学校ページの補足</strong>${esc(s.fyNotes)}</li>` : ""}
        </ul>
      </section>

      <section class="info-box is-checklist">
        <h4>学校に確認しておきたいこと</h4>
        <ul>${checklist.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </section>`;
  }

  // -------------------------------------------------------------------------
  // 入力
  // -------------------------------------------------------------------------
  let SCHOOLS = [];
  const byId = (id) => SCHOOLS.find((s) => s.id === id);

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

  function onSubmit(e) {
    e.preventDefault();
    const id = $("school").value;
    $("school-error").textContent = id ? "" : "志望校を選んでください";
    $("school-error").hidden = !!id;
    if (!id) return;
    const r = calc(byId(id));
    render(r);
    logUsage({
      type: "留学後",
      home: "",
      schools: [{ name: r.school.name, mode: "", nights: "" }],
      total: (() => { const t = monthlyTotal(r); return t ? round100(t.lo) : ""; })(),   // 記録用: 画面に出す毎月の合計の下限
    });
    const out = $("result");
    out.hidden = false;
    out.focus({ preventScroll: true });
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function init() {
    try {
      const res = await fetch("data/schools.json");
      if (!res.ok) throw new Error(res.status);
      SCHOOLS = await res.json();
    } catch (e) {
      $("sim-form").insertAdjacentHTML("beforeend", '<p class="field-error">学校データを読み込めませんでした、ページを再読み込みしてください</p>');
      return;
    }
    fillPrefs();
    $("pref").addEventListener("change", (e) => { fillSchools(e.target.value); $("school-error").hidden = true; });
    $("school").addEventListener("change", () => { $("school-error").hidden = true; });
    $("sim-form").addEventListener("submit", onSubmit);
  }

  // テスト用に計算関数を公開
  window.CostSim = { calc, missedMeals, schoolMonthly, AFTER };

  init();
})();
