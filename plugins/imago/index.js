(() => {
  const { metro, patcher, plugin, storage: vstorage, ui } = vendetta;
  const { findByProps, findByName } = metro;
  const { React, ReactNative: RN } = metro.common;
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { View, Text, TextInput, Pressable, Image, Modal, FlatList } = RN;
  const TAG = "[imago]";
  const MARK = "imago-button";
  const TARGET_RE = /ChatInputActions|ChatInputButtons|ChatInputActionButtons|InputActions|ChatInputRight/i;
  const HINT_RE = /gift|emoji|expression|voice|mic|record|sticker|present/i;
  const dbg = new Map();
  const note = (k, v) => { if (dbg.size < 60 && !dbg.has(k)) dbg.set(k, v); };
  const DEFAULT_BASE = "https://imago-gamma.vercel.app";
  const unpatches = [];

  const cfg = () => {
    const s = plugin.storage;
    if (s.apiKey === undefined) s.apiKey = "";
    if (!s.base) s.base = DEFAULT_BASE;
    return s;
  };

  async function search(q) {
    const s = cfg();
    if (!s.apiKey) throw new Error("Coloque sua Imago Key nas configurações do plugin (Addons > Imago > engrenagem).");
    const base = s.base.replace(/\/+$/, "");
    const url = `${base}/api/v1/search?q=${encodeURIComponent(q)}&limit=30`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${s.apiKey.trim()}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Imago respondeu ${res.status}`);
    return data.results || [];
  }

  function sendImage(url) {
    const chan = findByProps("getChannelId", "getLastSelectedChannelId");
    const msgs = findByProps("sendMessage", "receiveMessage");
    const channelId = chan && chan.getChannelId();
    if (!msgs || !channelId) {
      ui.toasts.showToast("Imago: não achei o canal.");
      return;
    }
    msgs.sendMessage(channelId, { content: url, invalidEmojis: [], tts: false, validNonShortcutEmojis: [] });
  }

  function Picker({ onPick, onClose }) {
    const [q, setQ] = useState("");
    const [items, setItems] = useState([]);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      let dead = false;
      setLoading(true);
      const t = setTimeout(() => {
        search(q)
          .then(r => { if (!dead) { setItems(r); setErr(""); } })
          .catch(e => { if (!dead) setErr(String((e && e.message) || e)); })
          .finally(() => { if (!dead) setLoading(false); });
      }, 350);
      return () => { dead = true; clearTimeout(t); };
    }, [q]);

    return h(Modal, { visible: true, transparent: true, animationType: "slide", onRequestClose: onClose },
      h(View, { style: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" } },
        h(Pressable, { style: { flex: 1 }, onPress: onClose }),
        h(View, { style: { height: "65%", backgroundColor: "#1e1f22", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 12 } },
          h(TextInput, {
            value: q, onChangeText: setQ, placeholder: "Buscar no Imago…", placeholderTextColor: "#80848e",
            style: { color: "#fff", backgroundColor: "#2b2d31", borderRadius: 10, padding: 10, marginBottom: 10 }
          }),
          err ? h(Text, { style: { color: "#f23f43", marginBottom: 8 } }, err) : null,
          loading && !items.length ? h(Text, { style: { color: "#b5bac1" } }, "Carregando…") : null,
          !loading && !err && !items.length ? h(Text, { style: { color: "#b5bac1" } }, "Nada encontrado.") : null,
          h(FlatList, {
            data: items, numColumns: 3, keyExtractor: it => it.id,
            renderItem: ({ item }) => h(Pressable, { style: { flex: 1 / 3, aspectRatio: 1, padding: 3 }, onPress: () => onPick(item.url) },
              h(Image, { source: { uri: item.url }, style: { flex: 1, borderRadius: 8, backgroundColor: "#2b2d31" }, resizeMode: "contain" }))
          })
        )
      )
    );
  }

  function ImagoButton() {
    const [open, setOpen] = useState(false);
    const pick = useCallback(u => { setOpen(false); sendImage(u); }, []);
    return h(View, null,
      h(Pressable, { onPress: () => setOpen(true), hitSlop: 6, style: { padding: 6 }, accessibilityLabel: "Imago" },
        h(Text, { style: { fontSize: 20 } }, "🖼️")),
      open ? h(Picker, { onPick: pick, onClose: () => setOpen(false) }) : null
    );
  }

  const tname = t => {
    if (!t) return "";
    if (typeof t === "string") return t;
    return t.displayName || t.name || (t.type && (t.type.displayName || t.type.name)) || (t.render && (t.render.displayName || t.render.name)) || "";
  };
  const label = el => {
    const p = (el && el.props) || {};
    const ic = p.icon || p.source || p.name || "";
    return `${tname(el && el.type)}|${p.testID || ""}|${p.accessibilityLabel || ""}|${(el && el.key) || ""}|${typeof ic === "string" || typeof ic === "number" ? ic : ""}`;
  };
  let logged = false;

  // chamado para todo elemento criado; só olha containers pequenos com filhos-elemento
  function onElement(ret) {
    if (!ret || !ret.props) return ret;
    const kids = ret.props.children;
    if (!Array.isArray(kids) || kids.length < 2 || kids.length > 8) return ret;
    let els = 0;
    for (let i = 0; i < kids.length; i++) if (React.isValidElement(kids[i])) els++;
    if (els < 2) return ret;
    const own = label(ret);
    const labels = kids.map(k => (React.isValidElement(k) ? label(k) : ""));
    const hinted = labels.some(l => HINT_RE.test(l));
    const target = TARGET_RE.test(own);
    if (/ChatInput/i.test(own)) note("ChatInput: " + own, labels.join(" , "));
    if (!hinted && !target) return ret;
    if (labels.some((l, i) => kids[i] && kids[i].key === MARK)) return ret;
    note("container: " + own, labels.join(" , "));
    const copy = kids.slice();
    let last = -1;
    for (let i = 0; i < copy.length; i++) if (React.isValidElement(copy[i])) last = i;
    copy.splice(last < 0 ? copy.length : last, 0, h(ImagoButton, { key: MARK }));
    try { ret.props.children = copy; return ret; }
    catch { return React.cloneElement(ret, { children: copy }); }
  }

  function hook() {
    let n = 0;
    const jsxr = findByProps("jsx", "jsxs");
    if (jsxr) {
      for (const fn of ["jsx", "jsxs"]) {
        try { unpatches.push(patcher.after(fn, jsxr, (_, ret) => { try { return onElement(ret); } catch { return ret; } })); n++; } catch (e) { console.error(TAG, e); }
      }
    }
    try { unpatches.push(patcher.after("createElement", React, (_, ret) => { try { return onElement(ret); } catch { return ret; } })); n++; } catch {}
    console.log(TAG, "hooks:", n);
    return n;
  }

  function SettingsPage() {
    vstorage.useProxy(plugin.storage);
    const s = cfg();
    const input = (title, key, secure) => h(View, { style: { padding: 12 } },
      h(Text, { style: { color: "#b5bac1", marginBottom: 6 } }, title),
      h(TextInput, {
        value: s[key], onChangeText: v => { s[key] = v; }, secureTextEntry: !!secure,
        autoCapitalize: "none", autoCorrect: false,
        style: { color: "#fff", backgroundColor: "#2b2d31", borderRadius: 10, padding: 10 }
      }));
    const [txt, setTxt] = useState("");
    const dump = () => {
      const lines = [];
      dbg.forEach((v, k) => lines.push(k + "\n  -> " + v));
      setTxt(lines.length ? lines.join("\n\n") : "Nada coletado. Abra um chat, digite algo e volte aqui.");
    };
    return h(View, null,
      input("Imago Key (imk_...)", "apiKey", true),
      input("Endereço do Imago", "base", false),
      h(View, { style: { padding: 12 } },
        h(Pressable, { onPress: dump, style: { backgroundColor: "#5865f2", borderRadius: 10, padding: 12, alignItems: "center" } },
          h(Text, { style: { color: "#fff" } }, "Diagnóstico do botão")),
        txt ? h(Text, { selectable: true, style: { color: "#b5bac1", marginTop: 10, fontSize: 11 } }, txt) : null));
  }

  return {
    onLoad() {
      cfg();
      hook();
      try { ui.toasts.showToast("Imago carregado"); } catch {}
    },
    onUnload() {
      for (const u of unpatches.splice(0)) { try { u(); } catch {} }
    },
    settings: SettingsPage
  };
})()
