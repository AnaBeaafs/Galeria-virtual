/* Admin Firebase — Auth + Firestore | fotos por URL (sem Storage) */
(function () {
  "use strict";

  var $ = function (s, ctx) {
    return (ctx || document).querySelector(s);
  };
  var $$ = function (s, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(s));
  };

  var galerias = [];
  var clientes = [];
  var pagina = "dashboard";
  var user = null;

  function uid(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }

  function slugify(text) {
    return (text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function formatarData(str) {
    if (!str) return "—";
    try {
      return new Date(str + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch (e) {
      return str;
    }
  }

  function msgErro(err) {
    var code = (err && err.code) || "";
    var msg = (err && err.message) || String(err);
    console.error("[Admin]", code, msg, err);
    if (code === "permission-denied" || msg.indexOf("insufficient permissions") !== -1) {
      return "Permissão negada.\n\n• Confirme que está logado\n• Firestore → Regras com write se request.auth != null\n• Clique em Publicar";
    }
    if (code === "not-found" || msg.indexOf("does not exist") !== -1) {
      return "Firestore não existe neste projeto.\nCrie em Build → Firestore Database.";
    }
    if (msg.indexOf("COLE_AQUI") !== -1 || (firebaseConfig && firebaseConfig.apiKey === "COLE_AQUI")) {
      return "Preencha assets/js/firebase-config.js com os dados do seu projeto Firebase.";
    }
    return "Erro: " + msg + (code ? "\nCódigo: " + code : "");
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error((label || "Operação") + " demorou demais (" + Math.round(ms / 1000) + "s)."));
      }, ms);
      promise.then(
        function (v) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(v);
        },
        function (e) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }

  async function carregarTudo() {
    if (!db) throw new Error("Firestore indisponível. Confira firebase-config.js");
    var snaps = await withTimeout(
      Promise.all([
        db.collection(COL_GALERIAS).get(),
        db.collection(COL_CLIENTES).get(),
      ]),
      20000,
      "Carregar dados"
    );
    galerias = snaps[0].docs.map(function (d) {
      return Object.assign({ id: d.id }, d.data());
    });
    clientes = snaps[1].docs.map(function (d) {
      return Object.assign({ id: d.id }, d.data());
    });
    galerias.sort(function (a, b) {
      var ta = 0, tb = 0;
      try { if (a.criado_em && a.criado_em.toMillis) ta = a.criado_em.toMillis(); } catch (e) {}
      try { if (b.criado_em && b.criado_em.toMillis) tb = b.criado_em.toMillis(); } catch (e) {}
      return tb - ta;
    });
    clientes.sort(function (a, b) {
      return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
    });
  }

  async function salvarCliente(c) {
    var ref = db.collection(COL_CLIENTES).doc();
    await withTimeout(
      ref.set({ nome: c.nome, email: c.email || "", telefone: c.telefone || "" }),
      15000,
      "Salvar cliente"
    );
    return ref.id;
  }

  async function excluirCliente(id) {
    await db.collection(COL_CLIENTES).doc(id).delete();
  }

  async function salvarGaleria(g) {
    var ref = db.collection(COL_GALERIAS).doc();
    await withTimeout(
      ref.set({
        slug: g.slug,
        nome: g.nome,
        cliente: g.cliente || "",
        data_evento: g.data_evento || null,
        mensagem: g.mensagem || null,
        capa: g.capa || null,
        status: "publica",
        tem_categorias: !!g.tem_categorias,
        download: g.download !== false,
        categorias: [],
        fotos: g.fotos || [],
        criado_em: firebase.firestore.FieldValue.serverTimestamp(),
        atualizado_em: firebase.firestore.FieldValue.serverTimestamp(),
      }),
      20000,
      "Salvar galeria"
    );
    return ref.id;
  }

  async function atualizarGaleria(id, patch) {
    patch.atualizado_em = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection(COL_GALERIAS).doc(id).update(patch);
  }

  async function excluirGaleria(id) {
    await db.collection(COL_GALERIAS).doc(id).delete();
  }

  function mostrarLogin() {
    var login = $("#tela-login");
    var painel = $("#painel");
    if (login) login.classList.remove("escondido");
    if (painel) painel.classList.add("escondido");
  }

  function mostrarPainel() {
    var login = $("#tela-login");
    var painel = $("#painel");
    if (login) login.classList.add("escondido");
    if (painel) painel.classList.remove("escondido");
    var conteudo = $("#conteudo");
    if (conteudo) {
      conteudo.innerHTML = '<p style="padding:40px;text-align:center;color:#5a6a7a;font-weight:500">Carregando...</p>';
    }
    carregarTudo()
      .then(function () { render(); })
      .catch(function (err) {
        if (!conteudo) return;
        conteudo.innerHTML =
          '<div style="padding:32px;max-width:560px"><h1 class="admin-titulo">Erro</h1>' +
          '<pre style="background:#fef2f2;color:#991b1b;padding:16px;border-radius:10px;white-space:pre-wrap;font-size:13px">' +
          esc(msgErro(err)) +
          '</pre><button class="btn-primario" id="btn-tentar" style="border-radius:10px">Tentar de novo</button></div>';
        $("#btn-tentar") && $("#btn-tentar").addEventListener("click", mostrarPainel);
      });
  }

  function render() {
    var el = $("#conteudo");
    if (!el) return;
    if (pagina === "dashboard") el.innerHTML = tplDashboard();
    else if (pagina === "galerias") el.innerHTML = tplGalerias();
    else if (pagina === "clientes") el.innerHTML = tplClientes();
    else if (pagina === "nova-galeria") el.innerHTML = tplNovaGaleria();
    else if (pagina === "novo-cliente") el.innerHTML = tplNovoCliente();
    else if (pagina.indexOf("galeria:") === 0) el.innerHTML = tplDetalhe(pagina.split(":")[1]);
    bindPainel();
  }

  function tplDashboard() {
    var totalFotos = galerias.reduce(function (a, g) {
      return a + (g.fotos ? g.fotos.length : 0);
    }, 0);
    return (
      '<h1 class="admin-titulo">Dashboard</h1>' +
      '<p class="admin-sub">Olá' + (user && user.email ? ", " + esc(user.email) : "") +
      " · Firestore (fotos por URL)</p>" +
      '<div class="stats">' +
      '<div class="stat-card"><div class="stat-valor">' + galerias.length + '</div><div class="stat-label">Galerias</div></div>' +
      '<div class="stat-card"><div class="stat-valor">' + clientes.length + '</div><div class="stat-label">Clientes</div></div>' +
      '<div class="stat-card"><div class="stat-valor">' + totalFotos + '</div><div class="stat-label">Fotos</div></div>' +
      '<div class="stat-card"><div class="stat-valor">URL</div><div class="stat-label">Sem Storage</div></div></div>' +
      '<div style="display:flex;gap:10px;margin-bottom:28px;flex-wrap:wrap">' +
      '<button class="btn-primario" data-go="nova-galeria" style="border-radius:10px">+ Nova galeria</button>' +
      '<button class="btn-primario" data-go="novo-cliente" style="border-radius:10px;background:#0a4a8a">+ Novo cliente</button></div>' +
      '<div class="lista-card">' +
      (galerias.length === 0
        ? '<p style="padding:24px;text-align:center;color:#5a6a7a;font-weight:500">Nenhuma galeria.</p>'
        : galerias.slice(0, 8).map(function (g) {
            return (
              '<a href="#" class="lista-item" data-abrir="' + esc(g.id) + '">' +
              '<img class="lista-thumb" src="' + esc(g.capa || "") + '" alt="" onerror="this.style.background=\'#e8e4df\'" />' +
              '<div class="lista-info"><div class="lista-nome">' + esc(g.nome) +
              '</div><div class="lista-meta">' + esc(g.cliente || "") + " · " +
              (g.fotos ? g.fotos.length : 0) + " fotos</div></div></a>"
            );
          }).join("")) +
      "</div>"
    );
  }

  function tplGalerias() {
    return (
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:6px">' +
      '<h1 class="admin-titulo" style="margin:0">Galerias</h1>' +
      '<button class="btn-primario" data-go="nova-galeria" style="border-radius:10px">+ Nova galeria</button></div>' +
      '<p class="admin-sub">Firestore</p><div class="lista-card">' +
      (galerias.length === 0
        ? '<p style="padding:24px;text-align:center;color:#5a6a7a;font-weight:500">Nenhuma galeria.</p>'
        : galerias.map(function (g) {
            return (
              '<a href="#" class="lista-item" data-abrir="' + esc(g.id) + '">' +
              '<img class="lista-thumb" src="' + esc(g.capa || "") + '" alt="" onerror="this.style.background=\'#e8e4df\'" />' +
              '<div class="lista-info"><div class="lista-nome">' + esc(g.nome) +
              '</div><div class="lista-meta">' + esc(g.cliente || "—") + " · /g/" + esc(g.slug) +
              "</div></div></a>"
            );
          }).join("")) +
      "</div>"
    );
  }

  function tplClientes() {
    return (
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:6px">' +
      '<h1 class="admin-titulo" style="margin:0">Clientes</h1>' +
      '<button class="btn-primario" data-go="novo-cliente" style="border-radius:10px">+ Novo cliente</button></div>' +
      '<p class="admin-sub">' + clientes.length + ' cliente(s)</p><div class="lista-card">' +
      (clientes.length === 0
        ? '<p style="padding:24px;text-align:center;color:#5a6a7a;font-weight:500">Nenhum cliente.</p>'
        : clientes.map(function (c) {
            return (
              '<div class="lista-item">' +
              '<div style="width:44px;height:44px;border-radius:50%;background:#afe3f4;display:flex;align-items:center;justify-content:center;font-weight:800;color:#032e5e">' +
              esc((c.nome || "?").charAt(0).toUpperCase()) +
              '</div><div class="lista-info"><div class="lista-nome">' + esc(c.nome) +
              '</div><div class="lista-meta">' + esc(c.email || "") + "</div></div>" +
              '<button data-excluir-cliente="' + esc(c.id) + '" style="color:#dc2626;font-size:12px;font-weight:700">Excluir</button></div>'
            );
          }).join("")) +
      "</div>"
    );
  }

  function tplNovoCliente() {
    return (
      '<button class="btn-icon" data-go="clientes" style="margin-bottom:16px;border-radius:8px;width:auto;padding:8px 14px;font-size:13px;font-weight:700">← Voltar</button>' +
      '<h1 class="admin-titulo">Novo cliente</h1>' +
      '<form id="form-cliente" style="background:#fff;border:1px solid var(--borda);border-radius:14px;padding:24px;max-width:480px">' +
      '<div class="form-grupo"><label class="form-label" for="cli-nome">Nome *</label>' +
      '<input class="form-input" id="cli-nome" required autocomplete="name" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="cli-email">E-mail</label>' +
      '<input class="form-input" id="cli-email" type="email" autocomplete="email" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="cli-tel">Telefone</label>' +
      '<input class="form-input" id="cli-tel" autocomplete="tel" /></div>' +
      '<button type="submit" class="btn-primario" style="border-radius:10px;width:100%;justify-content:center;padding:14px">Salvar cliente</button></form>'
    );
  }

  function tplNovaGaleria() {
    var opts = clientes.map(function (c) {
      return '<option value="' + esc(c.nome) + '">' + esc(c.nome) + "</option>";
    }).join("");
    return (
      '<button class="btn-icon" data-go="galerias" style="margin-bottom:16px;border-radius:8px;width:auto;padding:8px 14px;font-size:13px;font-weight:700">← Voltar</button>' +
      '<h1 class="admin-titulo">Nova galeria</h1>' +
      '<form id="form-galeria" style="background:#fff;border:1px solid var(--borda);border-radius:14px;padding:24px;max-width:520px">' +
      '<div class="form-grupo"><label class="form-label" for="gal-nome">Nome *</label>' +
      '<input class="form-input" id="gal-nome" required autocomplete="off" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="gal-cliente">Cliente *</label>' +
      (clientes.length
        ? '<select class="form-input" id="gal-cliente" required><option value="">Selecione...</option>' + opts + "</select>"
        : '<button type="button" class="btn-primario" data-go="novo-cliente" style="border-radius:10px">Cadastrar cliente primeiro</button>') +
      '</div>' +
      '<div class="form-grupo"><label class="form-label" for="gal-slug">Slug (link)</label>' +
      '<input class="form-input" id="gal-slug" autocomplete="off" placeholder="ana-pedro" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="gal-data">Data</label>' +
      '<input class="form-input" id="gal-data" type="date" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="gal-capa">URL da imagem de capa</label>' +
      '<input class="form-input" id="gal-capa" type="url" autocomplete="off" placeholder="https://..." /></div>' +
      '<div class="form-grupo"><label class="form-label" for="gal-msg">Mensagem</label>' +
      '<textarea class="form-input" id="gal-msg"></textarea></div>' +
      '<div class="form-grupo"><label class="form-check"><input type="checkbox" id="gal-download" checked /> Permitir download</label></div>' +
      '<button type="submit" class="btn-primario" style="border-radius:10px;width:100%;justify-content:center;padding:14px">Criar galeria</button></form>'
    );
  }

  function tplDetalhe(id) {
    var g = galerias.find(function (x) { return x.id === id; });
    if (!g) return "<p>Galeria não encontrada</p>";
    var base = location.href.replace(/admin\/?.*$/, "");
    var linkCliente = base + "g/index.html?slug=" + encodeURIComponent(g.slug);
    var fotos = g.fotos || [];
    return (
      '<button class="btn-icon" data-go="galerias" style="margin-bottom:16px;border-radius:8px;width:auto;padding:8px 14px;font-size:13px;font-weight:700">← Voltar</button>' +
      '<h1 class="admin-titulo">' + esc(g.nome) + "</h1>" +
      '<p class="admin-sub">' + esc(g.cliente || "") + " · " + formatarData(g.data_evento) + " · " + fotos.length + " fotos</p>" +
      (g.capa
        ? '<img src="' + esc(g.capa) + '" alt="" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;margin-bottom:20px" onerror="this.style.display=\'none\'" />'
        : "") +
      '<div style="background:#fff;border:1px solid var(--borda);border-radius:12px;padding:20px;margin-bottom:16px">' +
      '<h3 style="font-size:14px;font-weight:800;margin-bottom:6px">Link do cliente</h3>' +
      '<div class="link-box" id="link-cliente">' + esc(linkCliente) + "</div>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn-primario" id="btn-copiar" style="border-radius:10px">Copiar</button>' +
      '<a class="btn-primario" style="border-radius:10px;background:#0a4a8a" href="' + esc(linkCliente) + '" target="_blank">Visualizar</a></div></div>' +
      '<div style="background:#fff;border:1px solid var(--borda);border-radius:12px;padding:20px;margin-bottom:16px">' +
      '<h3 style="font-size:14px;font-weight:800;margin-bottom:6px">Imagem de capa (URL)</h3>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<input class="form-input" id="capa-url" type="url" placeholder="https://..." style="flex:1;min-width:200px" value="' + esc(g.capa || "") + '" />' +
      '<button class="btn-primario" id="btn-capa" style="border-radius:10px">Salvar capa</button></div></div>' +
      '<div style="background:#fff;border:1px solid var(--borda);border-radius:12px;padding:20px;margin-bottom:16px">' +
      '<h3 style="font-size:14px;font-weight:800;margin-bottom:6px">Adicionar fotografia (URL)</h3>' +
      '<p style="font-size:13px;color:var(--cinza);margin-bottom:12px">Cole o link direto da imagem (qualidade original do host). Sem Firebase Storage.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<input class="form-input" id="foto-url" type="url" placeholder="https://..." style="flex:1;min-width:200px" />' +
      '<button class="btn-primario" id="btn-add-foto" style="border-radius:10px">Adicionar</button></div></div>' +
      '<div style="background:#fff;border:1px solid var(--borda);border-radius:12px;padding:20px;margin-bottom:16px">' +
      '<h3 style="font-size:14px;font-weight:800;margin-bottom:12px">Fotos (' + fotos.length + ")</h3>" +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px">' +
      fotos.map(function (f) {
        return (
          '<div style="position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;background:#e8e4df">' +
          '<img src="' + esc(f.url) + '" alt="" style="width:100%;height:100%;object-fit:cover" />' +
          '<button type="button" data-capa-foto="' + esc(f.id) + '" style="position:absolute;bottom:4px;left:4px;padding:4px 8px;border-radius:6px;background:rgba(3,46,94,.85);color:#fff;font-size:10px;font-weight:700">Capa</button>' +
          '<button type="button" data-del-foto="' + esc(f.id) + '" style="position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;background:rgba(220,38,38,.9);color:#fff;font-weight:700">×</button></div>'
        );
      }).join("") +
      "</div></div>" +
      '<button id="btn-excluir" style="width:100%;padding:14px;border-radius:12px;border:1.5px solid #fecaca;background:#fef2f2;color:#dc2626;font-weight:700">Excluir galeria</button>'
    );
  }

  function bindPainel() {
    $$(".admin-nav a[data-page]").forEach(function (a) {
      var p = a.dataset.page;
      a.classList.toggle(
        "ativo",
        p === pagina ||
          (pagina.indexOf("galeria") === 0 && p === "galerias") ||
          (pagina.indexOf("cliente") !== -1 && p === "clientes")
      );
      a.onclick = function (e) {
        e.preventDefault();
        pagina = p;
        render();
      };
    });

    $("#btn-sair") &&
      $("#btn-sair").addEventListener("click", function (e) {
        e.preventDefault();
        auth.signOut();
      });

    $$("[data-go]").forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        pagina = el.dataset.go;
        render();
      };
    });

    $$("[data-abrir]").forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        pagina = "galeria:" + el.dataset.abrir;
        render();
      };
    });

    var formCli = $("#form-cliente");
    if (formCli) {
      formCli.addEventListener("submit", function (e) {
        e.preventDefault();
        var nome = $("#cli-nome").value.trim();
        if (!nome) return;
        var btn = formCli.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = "Salvando..."; }
        salvarCliente({
          nome: nome,
          email: $("#cli-email").value.trim(),
          telefone: $("#cli-tel").value.trim(),
        })
          .then(function () { return carregarTudo(); })
          .then(function () {
            alert("Cliente salvo!");
            pagina = "clientes";
            render();
          })
          .catch(function (err) {
            alert(msgErro(err));
            if (btn) { btn.disabled = false; btn.textContent = "Salvar cliente"; }
          });
      });
    }

    $$("[data-excluir-cliente]").forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm("Excluir cliente?")) return;
        excluirCliente(btn.dataset.excluirCliente)
          .then(function () { return carregarTudo(); })
          .then(render)
          .catch(function (err) { alert(msgErro(err)); });
      };
    });

    var formGal = $("#form-galeria");
    if (formGal) {
      var nomeInput = $("#gal-nome");
      var slugInput = $("#gal-slug");
      if (nomeInput && slugInput) {
        nomeInput.addEventListener("input", function () {
          if (!slugInput.dataset.manual) slugInput.value = slugify(nomeInput.value);
        });
        slugInput.addEventListener("input", function () {
          slugInput.dataset.manual = "1";
        });
      }
      formGal.addEventListener("submit", function (e) {
        e.preventDefault();
        var nome = $("#gal-nome").value.trim();
        var clienteEl = $("#gal-cliente");
        var cliente = clienteEl ? clienteEl.value.trim() : "";
        if (!nome) return alert("Informe o nome");
        if (!cliente) return alert("Selecione um cliente");
        var slug = $("#gal-slug").value.trim() || slugify(nome);
        if (galerias.some(function (g) { return g.slug === slug; })) {
          slug += "-" + Date.now().toString(36).slice(-4);
        }
        var btn = formGal.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = "Criando..."; }
        salvarGaleria({
          slug: slug,
          nome: nome,
          cliente: cliente,
          data_evento: $("#gal-data").value || null,
          mensagem: $("#gal-msg").value.trim() || null,
          capa: $("#gal-capa").value.trim() || null,
          download: $("#gal-download").checked,
          fotos: [],
        })
          .then(function (id) {
            return carregarTudo().then(function () { return id; });
          })
          .then(function (id) {
            alert("Galeria criada!");
            pagina = "galeria:" + id;
            render();
          })
          .catch(function (err) {
            alert(msgErro(err));
            if (btn) { btn.disabled = false; btn.textContent = "Criar galeria"; }
          });
      });
    }

    $("#btn-copiar") &&
      $("#btn-copiar").addEventListener("click", function () {
        var link = $("#link-cliente") && $("#link-cliente").textContent;
        if (link && navigator.clipboard) {
          navigator.clipboard.writeText(link).then(function () {
            $("#btn-copiar").textContent = "Copiado!";
            setTimeout(function () { $("#btn-copiar").textContent = "Copiar"; }, 1500);
          });
        }
      });

    $("#btn-capa") &&
      $("#btn-capa").addEventListener("click", function () {
        var url = ($("#capa-url") && $("#capa-url").value.trim()) || "";
        if (!url) return alert("Cole a URL da capa");
        var id = pagina.split(":")[1];
        atualizarGaleria(id, { capa: url })
          .then(function () { return carregarTudo(); })
          .then(function () {
            alert("Capa salva!");
            render();
          })
          .catch(function (err) { alert(msgErro(err)); });
      });

    $("#btn-add-foto") &&
      $("#btn-add-foto").addEventListener("click", function () {
        var url = ($("#foto-url") && $("#foto-url").value.trim()) || "";
        if (!url) return alert("Cole a URL da imagem");
        var id = pagina.split(":")[1];
        var g = galerias.find(function (x) { return x.id === id; });
        if (!g) return;
        if (!g.fotos) g.fotos = [];
        g.fotos.push({
          id: uid("f"),
          url: url,
          original: url,
          name: "",
          categoria: null,
          destaque: false,
        });
        var patch = { fotos: g.fotos };
        if (!g.capa) patch.capa = url;
        atualizarGaleria(id, patch)
          .then(function () { return carregarTudo(); })
          .then(function () { render(); })
          .catch(function (err) { alert(msgErro(err)); });
      });

    $$("[data-capa-foto]").forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        var fid = btn.dataset.capaFoto;
        var id = pagina.split(":")[1];
        var g = galerias.find(function (x) { return x.id === id; });
        if (!g) return;
        var foto = (g.fotos || []).find(function (f) { return f.id === fid; });
        if (!foto || !foto.url) return;
        atualizarGaleria(id, { capa: foto.url })
          .then(function () { return carregarTudo(); })
          .then(function () {
            alert("Capa definida!");
            render();
          })
          .catch(function (err) { alert(msgErro(err)); });
      };
    });

    $$("[data-del-foto]").forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm("Remover foto?")) return;
        var fid = btn.dataset.delFoto;
        var id = pagina.split(":")[1];
        var g = galerias.find(function (x) { return x.id === id; });
        if (!g) return;
        g.fotos = (g.fotos || []).filter(function (f) { return f.id !== fid; });
        atualizarGaleria(id, { fotos: g.fotos })
          .then(function () { return carregarTudo(); })
          .then(render)
          .catch(function (err) { alert(msgErro(err)); });
      };
    });

    $("#btn-excluir") &&
      $("#btn-excluir").addEventListener("click", function () {
        if (!confirm("Excluir galeria?")) return;
        var id = pagina.split(":")[1];
        excluirGaleria(id)
          .then(function () { return carregarTudo(); })
          .then(function () {
            pagina = "galerias";
            render();
          })
          .catch(function (err) { alert(msgErro(err)); });
      });
  }

  function boot() {
    var formLogin = $("#form-login");
    if (formLogin) {
      formLogin.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = $("#email").value.trim();
        var senha = $("#senha").value;
        var erro = $("#erro");
        var btn = formLogin.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = "Entrando..."; }
        if (!auth) {
          if (erro) {
            erro.style.display = "block";
            erro.textContent = "Firebase não inicializou. Preencha firebase-config.js";
          }
          if (btn) { btn.disabled = false; btn.textContent = "Entrar"; }
          return;
        }
        auth.signInWithEmailAndPassword(email, senha).catch(function (err) {
          if (erro) {
            erro.style.display = "block";
            erro.textContent =
              err.code === "auth/invalid-credential" ||
              err.code === "auth/wrong-password" ||
              err.code === "auth/user-not-found"
                ? "E-mail ou senha incorretos."
                : err.message;
          }
          if (btn) { btn.disabled = false; btn.textContent = "Entrar"; }
        });
      });
    }

    if (!auth || !db) {
      var erro = $("#erro");
      if (erro) {
        erro.style.display = "block";
        erro.textContent =
          "Firebase não inicializou. Abra assets/js/firebase-config.js e cole os dados do seu projeto (troque COLE_AQUI).";
      }
      return;
    }

    var hint = $(".login-hint");
    if (hint) {
      hint.innerHTML = "Usuário do Firebase Authentication<br>(sem Storage — fotos por URL)";
    }

    auth.onAuthStateChanged(function (u) {
      user = u;
      if (u) mostrarPainel();
      else mostrarLogin();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
