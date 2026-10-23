(function (exports) {
  "use strict";
  var findByProps = vendetta.metro.findByProps;
  var instead = vendetta.patcher.instead;
  var patches = [];

  function onLoad() {
    onUnload();
    var t = findByProps("startTyping", "stopTyping");
    if (t) patches.push(instead("startTyping", t, function () {}));
  }
  function onUnload() {
    patches.forEach(function (u) { try { u(); } catch (e) {} });
    patches = [];
  }
  exports.onLoad = onLoad;
  exports.onUnload = onUnload;
  return exports;
})({});
