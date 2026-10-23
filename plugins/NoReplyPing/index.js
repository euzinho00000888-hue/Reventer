(function (exports) {
  "use strict";
  var findByProps = vendetta.metro.findByProps;
  var before = vendetta.patcher.before;
  var patches = [];

  function onLoad() {
    onUnload();
    var r = findByProps("createPendingReply");
    if (r) patches.push(before("createPendingReply", r, function (args) {
      if (args[0]) args[0].shouldMention = false;
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
