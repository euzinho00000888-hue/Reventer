(() => {
  const { metro, patcher, plugin, storage: vstorage, ui } = vendetta;
  const { findByProps, findByName } = metro;
  const { React, ReactNative: RN } = metro.common;
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { View, Text, TextInput, Pressable, Image, Modal, FlatList } = RN;
  const TAG = "[imago]";
  const MARK = "imago-button";
  const TARGET_RE = /ChatInputActions|ChatInputButtons|ChatInputActionButtons|InputActions/i;
  const HINT_RE = /gift|emoji|expression|voice|mic|record/i;
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

  const label = el => {
    const t = el && el.type;
    const p = (el && el.props) || {};
    return `${(t && (t.displayName || t.name)) || ""}|${p.testID || ""}|${p.accessibilityLabel || ""}|${(el && el.key) || ""}`;
  };
  let logged = false;

  // acha o container dos botões e põe o Imago antes do último (microfone)
  function inject(node) {
    if (!React.isValidElement(node)) return false;
    const props = node.props || {};
    const kids = props.children;
    if (Array.isArray(kids)) {
      const flat = kids.flat(Infinity);
      const els = flat.filter(React.isValidElement);
      if (els.length >= 2 && els.some(e => HINT_RE.test(label(e)))) {
        if (els.some(e => e.key === MARK)) return true;
        if (!logged) { logged = true; console.log(TAG, "container achado:", els.map(label).join(" , ")); }
        const copy = flat.slice();
        const lastEl = copy.map(x => React.isValidElement(x)).lastIndexOf(true);
        copy.splice(lastEl < 0 ? copy.length : lastEl, 0, h(ImagoButton, { key: MARK }));
        props.children = copy;
        return true;
      }
      for (const k of flat) if (inject(k)) return true;
    } else if (kids && inject(kids)) return true;
    return false;
  }

  function wrapExport(holder, key) {
    const orig = holder[key];
    console.log(TAG, "candidato:", key);
    const wrapped = function (...args) {
      const res = orig.apply(this, args);
      try { inject(res); } catch (e) { console.error(TAG, "inject falhou", e); }
      return res;
    };
    Object.assign(wrapped, orig);
    try { holder[key] = wrapped; }
    catch { try { Object.defineProperty(holder, key, { value: wrapped, configurable: true, writable: true }); } catch { return false; } }
    unpatches.push(() => { try { holder[key] = orig; } catch {} });
    return true;
  }

  function hook() {
    let n = 0;
    // 1) caminho direto
    for (const name of ["ChatInputActions", "ChatInputButtons"]) {
      try {
        const mod = findByName(name, false);
        if (mod && typeof mod.default === "function") {
          const un = patcher.after("default", mod, (_, ret) => { try { inject(ret); } catch (e) { console.error(TAG, e); } });
          unpatches.push(un); n++;
          console.log(TAG, "patch direto:", name);
        }
      } catch {}
    }
    if (n) return n;
    // 2) varredura dos módulos já inicializados
    const mods = window.modules || {};
    const seen = new Set();
    for (const id in mods) {
      let ex;
      try { const m = mods[id]; if (!m || !m.isInitialized) continue; ex = m.publicModule && m.publicModule.exports; } catch { continue; }
      if (!ex) continue;
      for (const holder of [ex, ex.default]) {
        if (!holder || (typeof holder !== "object" && typeof holder !== "function")) continue;
        let keys = [];
        try { keys = Object.keys(holder); } catch {}
        for (const key of keys) {
          let v; try { v = holder[key]; } catch { continue; }
          if (typeof v !== "function" || seen.has(v)) continue;
          if (!(TARGET_RE.test(key) || TARGET_RE.test(v.displayName || ""))) continue;
          seen.add(v);
          if (wrapExport(holder, key)) n++;
        }
      }
    }
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
    return h(View, null,
      input("Imago Key (imk_...)", "apiKey", true),
      input("Endereço do Imago", "base", false));
  }

  let timer;
  return {
    onLoad() {
      cfg();
      let tries = 0;
      const run = () => {
        tries++;
        if (hook() > 0 || tries >= 10) {
          if (!unpatches.length) console.warn(TAG, "nenhum alvo encontrado para o botão");
          clearInterval(timer);
        }
      };
      timer = setInterval(run, 2000);
      run();
    },
    onUnload() {
      clearInterval(timer);
      for (const u of unpatches.splice(0)) { try { u(); } catch {} }
    },
    settings: SettingsPage
  };
})()
