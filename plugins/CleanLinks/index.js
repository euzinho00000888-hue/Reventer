(function (exports) {
  "use strict";
  var findByProps = vendetta.metro.findByProps;
  var before = vendetta.patcher.before;
  var patches = [];

  var TRACKING = /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|yclid|igshid|mc_eid|mc_cid|ref_src|ref_url|_hsenc|_hsmi|spm)$/i;

  function cleanUrl(url) {
    var hashIdx = url.indexOf("#");
    var hash = hashIdx === -1 ? "" : url.slice(hashIdx);
    var base = hashIdx === -1 ? url : url.slice(0, hashIdx);
    var qIdx = base.indexOf("?");
    if (qIdx === -1) return url;
    var path = base.slice(0, qIdx);
    var kept = base.slice(qIdx + 1).split("&").filter(function (p) {
      return p && !TRACKING.test(p.split("=")[0]);
    });
    return path + (kept.length ? "?" + kept.join("&") : "") + hash;
  }

  function cleanText(text) {
    return text.replace(/https?:\/\/[^\s<>]+/g, cleanUrl);
  }

  function onLoad() {
    onUnload();
    var m = findByProps("sendMessage", "receiveMessage");
    if (m) patches.push(before("sendMessage", m, function (args) {
      var msg = args[1];
      if (msg && typeof msg.content === "string") msg.content = cleanText(msg.content);
    }));
  }
  function onUnload() {
    patches.forEach(function (u) { try { u(); } catch (e) {} });
    patches = [];
  }
  exports.onLoad = onLoad;
  exports.onUnload = onUnload;
  return exports;
})({});
