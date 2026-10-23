(function (exports) {
  "use strict";

  var metro = vendetta.metro;
  var findByProps = metro.findByProps;
  var React = metro.common.React;
  var storage = vendetta.plugin.storage;
  var useProxy = vendetta.storage.useProxy;
  var showToast = vendetta.ui.toasts.showToast;
  var components = vendetta.ui.components;
  var Forms = components.Forms;
  var General = components.General;
  var registerCommand = vendetta.commands.registerCommand;

  var API = "https://openrouter.ai/api/v1";
  var DEFAULT_MODEL = "openai/gpt-4o-mini";
  var DEFAULT_SYSTEM = "Você é o Reventer, um assistente prestativo dentro do Discord. Responda de forma clara e direta, no idioma do usuário.";

  if (storage.model == null) storage.model = DEFAULT_MODEL;
  if (storage.system == null) storage.system = DEFAULT_SYSTEM;
  if (storage.apiKey == null) storage.apiKey = "";

  var history = [];
  var unregister = [];

  function headers() {
    return {
      "Content-Type": "application/json",
      Authorization: "Bearer " + storage.apiKey,
      "HTTP-Referer": "https://github.com/reventer",
      "X-Title": "Reventer"
    };
  }

  function errorMessage(json, status) {
    return (json && json.error && json.error.message) || ("HTTP " + status);
  }

  async function ask(text) {
    history.push({ role: "user", content: text });
    var msgs = [];
    if (storage.system && storage.system.trim()) msgs.push({ role: "system", content: storage.system });
    msgs = msgs.concat(history.slice(-30));
    try {
      var res = await fetch(API + "/chat/completions", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ model: storage.model || DEFAULT_MODEL, messages: msgs })
      });
      var json = null;
      try { json = await res.json(); } catch (e) {}
      if (!res.ok) throw new Error(errorMessage(json, res.status));
      var out = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (!out || !out.trim()) throw new Error(json && json.error ? errorMessage(json, res.status) : "Resposta vazia");
      out = out.trim();
      history.push({ role: "assistant", content: out });
      return out;
    } catch (e) {
      history.pop(); // tira a pergunta que falhou
      throw e;
    }
  }

  async function fetchModels() {
    var res = await fetch(API + "/models", { headers: storage.apiKey ? headers() : { "Content-Type": "application/json" } });
    var json = await res.json();
    if (!res.ok) throw new Error(errorMessage(json, res.status));
    return (json.data || []).map(function (m) { return m.id; }).filter(Boolean).sort();
  }

  function reply(ctx, text) {
    var bm = findByProps("sendBotMessage");
    if (bm && bm.sendBotMessage && ctx && ctx.channel) {
      bm.sendBotMessage(ctx.channel.id, text);
      return true;
    }
    showToast(text.slice(0, 180));
    return false;
  }

  function option(name, description, type, required) {
    return { name: name, displayName: name, description: description, displayDescription: description, type: type, required: !!required };
  }

  function command(name, description, options, execute) {
    return registerCommand({
      name: name,
      displayName: name,
      description: description,
      displayDescription: description,
      options: options,
      applicationId: "-1",
      inputType: 1,
      type: 1,
      execute: execute
    });
  }

  function getArg(args, name) {
    var a = (args || []).find(function (x) { return x.name === name; });
    return a ? a.value : undefined;
  }

  // ---------------------------------------------------------------- tela de configuração (chave de fenda)
  var h = React.createElement;

  function Settings() {
    useProxy(storage);
    var st = React.useState(null), models = st[0], setModels = st[1];
    var ld = React.useState(false), loading = ld[0], setLoading = ld[1];

    var key = storage.apiKey || "";
    var keyInfo = key ? "Key salva (…" + key.slice(-4) + ")" : "Nenhuma key salva";

    var q = (storage.model || "").toLowerCase();
    var shown = models ? models.filter(function (id) { return id.toLowerCase().indexOf(q) !== -1; }).slice(0, 30) : [];

    return h(General.ScrollView, { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
      h(Forms.FormSection, { title: "OpenRouter" },
        h(Forms.FormInput, {
          title: "API key",
          placeholder: "sk-or-v1-…",
          value: storage.apiKey,
          onChange: function (v) { storage.apiKey = (v || "").trim(); },
          secureTextEntry: true
        }),
        h(Forms.FormRow, { label: keyInfo })
      ),
      h(Forms.FormSection, { title: "Modelo" },
        h(Forms.FormInput, {
          title: "ID do modelo",
          placeholder: DEFAULT_MODEL,
          value: storage.model,
          onChange: function (v) { storage.model = (v || "").trim(); }
        }),
        h(Forms.FormRow, {
          label: loading ? "Carregando…" : "Listar modelos da OpenRouter",
          subLabel: models ? "Digite acima para filtrar. Toque num modelo para escolher." : "Toque para buscar a lista.",
          onPress: function () {
            if (loading) return;
            setLoading(true);
            fetchModels().then(setModels).catch(function (e) {
              showToast("Erro: " + e.message);
            }).then(function () { setLoading(false); });
          }
        }),
        shown.map(function (id) {
          return h(Forms.FormRow, {
            key: id,
            label: id,
            onPress: function () { storage.model = id; setModels(null); }
          });
        })
      ),
      h(Forms.FormSection, { title: "Prompt de sistema" },
        h(Forms.FormInput, {
          title: "Como o modelo deve se comportar",
          value: storage.system,
          onChange: function (v) { storage.system = v; },
          multiline: true
        })
      ),
      h(Forms.FormSection, { title: "Como usar" },
        h(Forms.FormRow, { label: "/ai", subLabel: "Pergunta ao modelo. Só você vê a resposta. Opção \"public\" envia no canal." }),
        h(Forms.FormRow, { label: "/ai-clear", subLabel: "Apaga a conversa atual com o modelo." })
      )
    );
  }

  // ---------------------------------------------------------------- ciclo de vida
  function onLoad() {
    onUnload();
    unregister.push(command("ai", "Converse com um modelo de IA da OpenRouter", [
      option("message", "Sua mensagem", 3, true),
      option("public", "Enviar a resposta no canal (padrão: só você vê)", 5, false)
    ], async function (args, ctx) {
      var text = getArg(args, "message");
      var pub = !!getArg(args, "public");
      if (!text) return;
      if (!storage.apiKey) {
        reply(ctx, "Configure sua API key em Addons > Reventer > chave de fenda.");
        return;
      }
      showToast("Reventer: pensando…");
      try {
        var out = await ask(text);
        if (pub) return { content: out.slice(0, 2000) };
        reply(ctx, out);
      } catch (e) {
        reply(ctx, "Erro do Reventer: " + e.message);
      }
    }));

    unregister.push(command("ai-clear", "Apaga a conversa atual com o Reventer", [], function () {
      history.length = 0;
      showToast("Conversa apagada");
    }));
  }

  function onUnload() {
    unregister.forEach(function (u) { try { u(); } catch (e) {} });
    unregister = [];
  }

  exports.onLoad = onLoad;
  exports.onUnload = onUnload;
  exports.settings = Settings;
  return exports;
})({});
