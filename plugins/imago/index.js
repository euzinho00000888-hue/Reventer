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

  const toast = m => { try { ui.toasts.showToast(m); } catch {} };

  function currentChannel() {
    let id;
    try { const st = metro.findByStoreName && metro.findByStoreName("SelectedChannelStore"); id = st && st.getChannelId(); } catch {}
    if (!id) {
      try { const c = findByProps("getChannelId", "getLastSelectedChannelId"); id = c && c.getChannelId(); } catch {}
    }
    return id;
  }

  async function sendImage(url) {
    const channelId = currentChannel();
    if (!channelId) return toast("Imago: não achei o canal.");
    // 1) API REST do Discord
    try {
      const rest = findByProps("getAPIBaseURL", "post") || findByProps("post", "patch", "del");
      if (rest) {
        const nonce = String(Date.now() * 4194304 + Math.floor(Math.random() * 4194304));
        await rest.post({ url: `/channels/${channelId}/messages`, body: { content: url, tts: false, flags: 0, nonce } });
        return;
      }
    } catch (e) { console.error(TAG, "REST falhou", e); }
    // 2) sendMessage interno
    try {
      const msgs = findByProps("sendMessage", "receiveMessage");
      if (msgs) {
        await msgs.sendMessage(channelId, { content: url, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, undefined, {});
        return;
      }
    } catch (e) { console.error(TAG, "sendMessage falhou", e); toast("Imago: erro ao enviar: " + ((e && e.message) || e)); return; }
    toast("Imago: não achei como enviar a mensagem.");
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

  const ICON = "data:image/png;base64,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";
  const iconColor = () => {
    try {
      const r = findByProps("resolveSemanticColor");
      const sc = ui.semanticColors;
      if (r && sc && sc.INTERACTIVE_NORMAL) {
        const theme = findByProps("theme") ;
        const c = r.resolveSemanticColor(theme && theme.theme ? theme.theme : "dark", sc.INTERACTIVE_NORMAL);
        if (typeof c === "string") return c;
      }
    } catch {}
    return "#b5bac1";
  };

  function ImagoButton() {
    const [open, setOpen] = useState(false);
    const [ok, setOk] = useState(true);
    const ref = React.useRef(null);
    const pick = useCallback(u => { setOpen(false); sendImage(u); }, []);
    // só aparece se estiver na barra real (cópias soltas no canto esquerdo ficam invisíveis)
    const check = () => {
      [60, 400, 1200].forEach(ms => setTimeout(() => {
        try {
          ref.current.measureInWindow((x, y, w, hh) => {
            if (!x && !y) setOk(true);          // sem medida válida: mostra
            else if (!w || !hh) setOk(false);   // sem tamanho: cópia solta
            else setOk(x >= 8 && y > 0);        // só esconde cópia colada no canto (0,0)
          });
        } catch { setOk(true); }
      }, ms));
    };
    return h(View, { ref, onLayout: check, style: { opacity: ok ? 1 : 0 }, pointerEvents: ok ? "auto" : "none" },
      h(Pressable, { onPress: () => setOpen(true), hitSlop: 6, style: { padding: 6 }, accessibilityLabel: "Imago" },
        h(Image, { source: { uri: ICON }, style: { width: 24, height: 24, tintColor: iconColor() } })),
      open && ok ? h(Picker, { onPick: pick, onClose: () => setOpen(false) }) : null
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
    if (labels.some(l => /reaction/i.test(l)) || /reaction/i.test(own)) return ret;
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
