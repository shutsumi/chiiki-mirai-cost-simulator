/* 検討時の費用: 地図で「お住まいの場所」と「志望校」を選ぶための地図部品
 *
 * config.js に googleMapsApiKey が設定されていれば Google マップ(Maps JavaScript API)、
 * 設定されていなければ 国土地理院の地図(地理院タイル＋Leaflet)で表示する。
 * どちらでも、次の同じ操作ができる:
 *   - 地図をクリック(タップ)した地点を通知する(お住まいの場所)
 *   - 学校のピンを表示し、クリックされた学校を通知する(志望校)
 *   - 学校のピンの上に吹き出し(交通手段・宿泊日数を選ぶ欄)を出す
 */
(function () {
  "use strict";

  const JAPAN_CENTER = { lat: 37.6, lng: 137.8 };
  const COLORS = { pin: "#00a1e9", selected: "#fff000", selectedEdge: "#333333", home: "#333333" };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = () => reject(new Error("load error: " + src));
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    document.head.appendChild(l);
  }
  const startZoom = (el) => (el.clientWidth < 500 ? 4 : 5);

  // ---------------------------------------------------------------------------
  // Google マップ
  // ---------------------------------------------------------------------------
  async function createGoogle(el, key) {
    await new Promise((resolve, reject) => {
      window.__simGoogleMapsReady = resolve;
      loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=ja&region=JP&callback=__simGoogleMapsReady`)
        .catch(reject);
    });
    const g = window.google.maps;
    const map = new g.Map(el, {
      center: JAPAN_CENTER, zoom: startZoom(el), minZoom: 4,
      clickableIcons: false, mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
      gestureHandling: "greedy",
    });
    const info = new g.InfoWindow({ maxWidth: 300 });
    const markers = {};
    let home = null;
    const icon = (selected) => ({
      path: g.SymbolPath.CIRCLE, scale: selected ? 9 : 6.5, fillOpacity: 1,
      fillColor: selected ? COLORS.selected : COLORS.pin,
      strokeColor: selected ? COLORS.selectedEdge : "#ffffff", strokeWeight: selected ? 2 : 1.5,
    });
    return {
      provider: "google",
      setSchools(list, onClick) {
        list.forEach((s) => {
          const m = new g.Marker({ map, position: { lat: s.lat, lng: s.lng }, title: s.name, icon: icon(false) });
          m.addListener("click", () => onClick(s));
          markers[s.id] = m;
        });
      },
      onMapClick(cb) { map.addListener("click", (e) => { info.close(); cb(e.latLng.lat(), e.latLng.lng()); }); },
      setSelected(ids) {
        Object.entries(markers).forEach(([id, m]) => {
          const on = ids.includes(id);
          m.setIcon(icon(on)); m.setZIndex(on ? 1000 : undefined);
        });
      },
      setHome(lat, lng) {
        const pos = { lat, lng };
        if (!home) {
          home = new g.Marker({ map, position: pos, title: "お住まいの場所", zIndex: 2000,
            label: { text: "家", color: "#ffffff", fontSize: "12px", fontWeight: "700" },
            icon: { path: g.SymbolPath.CIRCLE, scale: 11, fillColor: COLORS.home, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 } });
        } else home.setPosition(pos);
      },
      openPopup(school, content) { info.setContent(content); info.open({ map, anchor: markers[school.id] }); },
      closePopup() { info.close(); },
      refresh() { /* Google マップは表示時に自動で大きさを合わせる */ },
    };
  }

  // ---------------------------------------------------------------------------
  // 国土地理院の地図(地理院タイル＋Leaflet)
  // ---------------------------------------------------------------------------
  async function createGsi(el) {
    loadCss("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js");
    const L = window.L;
    const map = L.map(el, { center: [JAPAN_CENTER.lat, JAPAN_CENTER.lng], zoom: startZoom(el), minZoom: 4, maxZoom: 17, preferCanvas: true });
    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
      maxZoom: 18,
    }).addTo(map);
    const markers = {};
    let home = null;
    const style = (selected) => selected
      ? { radius: 10, color: COLORS.selectedEdge, weight: 2, fillColor: COLORS.selected, fillOpacity: 1 }
      : { radius: 7, color: "#ffffff", weight: 1.5, fillColor: COLORS.pin, fillOpacity: 1 };
    const popup = L.popup({ maxWidth: 300, minWidth: 240, autoPanPadding: [16, 16] });
    return {
      provider: "gsi",
      setSchools(list, onClick) {
        list.forEach((s) => {
          const m = L.circleMarker([s.lat, s.lng], style(false)).addTo(map);
          m.bindTooltip(s.name, { direction: "top", offset: [0, -6] });
          m.on("click", (e) => { L.DomEvent.stopPropagation(e); onClick(s); });
          markers[s.id] = m;
        });
      },
      onMapClick(cb) { map.on("click", (e) => { map.closePopup(); cb(e.latlng.lat, e.latlng.lng); }); },
      setSelected(ids) {
        Object.entries(markers).forEach(([id, m]) => {
          const on = ids.includes(id);
          m.setStyle(style(on));
          if (on) m.bringToFront();
        });
      },
      setHome(lat, lng) {
        if (!home) {
          home = L.marker([lat, lng], {
            title: "お住まいの場所", zIndexOffset: 2000,
            icon: L.divIcon({ className: "home-pin", html: "<span>家</span>", iconSize: [26, 26], iconAnchor: [13, 13] }),
          }).addTo(map);
        } else home.setLatLng([lat, lng]);
      },
      openPopup(school, content) {
        popup.setLatLng([school.lat, school.lng]).setContent(content);
        popup.options.offset = L.point(0, -6);
        map.openPopup(popup);
      },
      closePopup() { map.closePopup(); },
      refresh() { map.invalidateSize(); },
    };
  }

  // 地図の地点 → 都道府県(国土地理院の住所検索API。無料・登録不要)
  const PREF_BY_CODE = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
    "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県",
    "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県",
    "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

  async function prefAt(lat, lng) {
    const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("reverse geocode " + res.status);
    const j = await res.json();
    const code = j && j.results && j.results.muniCd;
    if (!code) return null;   // 海の上・日本の外
    return { pref: PREF_BY_CODE[Number(String(code).padStart(5, "0").slice(0, 2)) - 1] || null, place: j.results.lv01Nm || "" };
  }

  window.SimMap = {
    async create(el) {
      const key = (window.SIM_CONFIG && window.SIM_CONFIG.googleMapsApiKey) || "";
      if (key) {
        try { return await createGoogle(el, key); } catch (e) { /* 読み込めなければ地理院の地図にする */ }
      }
      return createGsi(el);
    },
    prefAt,
  };
})();
