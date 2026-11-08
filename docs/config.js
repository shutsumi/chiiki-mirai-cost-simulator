/* シミュレーターの設定
 *
 * logEndpoint: 入力内容を記録するGoogle Apps Scriptのウェブアプリ URL
 *   (https://script.google.com/macros/s/..../exec の形)。
 *   空のままにすると、記録は行いません。設定方法は README.md の「入力内容の記録」を参照。
 *
 * googleMapsApiKey: 検討時の費用の地図を Google マップで表示するための APIキー(Maps JavaScript API)。
 *   空のままにすると、国土地理院の地図で表示します(操作は同じ)。取得方法は README.md の「地図(Googleマップ)」を参照。
 */
window.SIM_CONFIG = {
  logEndpoint: "https://script.google.com/macros/s/AKfycbyrCKC3U3P8JjaTKCTQcrfb5GvjRsxTpNOxj_bRT1q56I0wTf028_mkaqazczXdJblPEA/exec",
  googleMapsApiKey: "",
};
