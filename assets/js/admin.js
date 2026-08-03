/* Admin Firebase — Auth + Firestore | fotos por URL | editar + categorias */
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
      return "Permissão negada. Confirme login e regras do Firestore.";
    }
    if (code === "not-found" || msg.indexOf("does not exist") !== -1) {
      return "Firestore não encontrado. Crie o banco no Console.";
    }
    return "Erro: " + msg + (code ? "\nCódigo: " + code : "");
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error((label || "Operação") + " demorou demais."));
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
      "Carregar"
    );
    galerias = snaps[0].docs.map(function (d) {
      return Object.assign({ id: d.id }, d.data());
    });
    clientes = snaps[1].docs.map(function (d) {
      return Object.assign({ id: d.id }, d.data());
    });
    galerias.sort(function (a, b) {
      var ta = 0, tb = 0;
      try {
        if (a.criado_em && a.criado_em.toMillis) ta = a.criado_em.toMillis();
      } catch (e) {}
      try {
        if (b.criado_em && b.criado_em.toMillis) tb = b.criado_em.toMillis();
      } catch (e) {}
      return tb - ta;
    });
    clientes.sort(function (a, b) {
      return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
    });
  }

  async function salvarCliente(c) {
    var ref = c.id
      ? db.collection(COL_CLIENTES).doc(c.id)
      : db.collection(COL_CLIENTES).doc();
    await withTimeout(
      ref.set(
        { nome: c.nome, email: c.email || "", telefone: c.telefone || "" },
        { merge: true }
      ),
      15000,
      "Salvar cliente"
    );
    return ref.id;
  }

  async function excluirCliente(id) {
    await db.collection(COL_CLIENTES).doc(id).delete();
  }

  async function salvarGaleria(g, idExistente) {
    var ref = idExistente
      ? db.collection(COL_GALERIAS).doc(idExistente)
      : db.collection(COL_GALERIAS).doc();
    var data = {
      slug: g.slug,
      nome: g.nome,
      cliente: g.cliente || "",
      data_evento: g.data_evento || null,
      mensagem: g.mensagem || null,
      capa: g.capa || null,
      status: g.status || "publica",
      tem_categorias: !!g.tem_categorias,
      download: g.download !== false,
      categorias: g.categorias || [],
      fotos: g.fotos || [],
      atualizado_em: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (!idExistente) {
      data.criado_em = firebase.firestore.FieldValue.serverTimestamp();
    }
    await withTimeout(ref.set(data, { merge: true }), 20000, "Salvar galeria");
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
    if (conteudo)
      conteudo.innerHTML =
        '<p style="padding:40px;text-align:center;color:#5a6a7a;font-weight:500">Carregando...</p>';
    carregarTudo()
      .then(function () {
        render();
      })
      .catch(function (err) {
        if (!conteudo) return;
        conteudo.innerHTML =
          '<div style="padding:32px;max-width:560px"><h1 class="admin-titulo">Erro</h1><pre style="background:#fef2f2;color:#991b1b;padding:16px;border-radius:10px;white-space:pre-wrap;font-size:13px">' +
          esc(msgErro(err)) +
          '</pre><button class="btn-primario" id="btn-tentar" style="border-radius:10px">Tentar de novo</button></div>';
        $("#btn-tentar") &&
          $("#btn-tentar").addEventListener("click", mostrarPainel);
      });
  }

  function render() {
    var el = $("#conteudo");
    if (!el) return;
    if (pagina === "dashboard") el.innerHTML = tplDashboard();
    else if (pagina === "galerias") el.innerHTML = tplGalerias();
    else if (pagina === "clientes") el.innerHTML = tplClientes();
    else if (pagina === "nova-galeria") el.innerHTML = tplFormGaleria(null);
    else if (pagina === "novo-cliente") el.innerHTML = tplFormCliente(null);
    else if (pagina.indexOf("editar-cliente:") === 0)
      el.innerHTML = tplFormCliente(pagina.split(":")[1]);
    else if (pagina.indexOf("editar-galeria:") === 0)
      el.innerHTML = tplFormGaleria(pagina.split(":")[1]);
    else if (pagina.indexOf("galeria:") === 0)
      el.innerHTML = tplDetalhe(pagina.split(":")[1]);
    bindPainel();
  }

  function tplDashboard() {
    var totalFotos = galerias.reduce(function (a, g) {
      return a + (g.fotos ? g.fotos.length : 0);
    }, 0);
    return (
      '<h1 class="admin-titulo">Dashboard</h1>' +
      '<p class="admin-sub">Olá' +
      (user && user.email ? ", " + esc(user.email) : "") +
      " · Firestore</p>" +
      '<div class="stats">' +
      '<div class="stat-card"><div class="stat-valor">' +
      galerias.length +
      '</div><div class="stat-label">Galerias</div></div>' +
      '<div class="stat-card"><div class="stat-valor">' +
      clientes.length +
      '</div><div class="stat-label">Clientes</div></div>' +
      '<div class="stat-card"><div class="stat-valor">' +
      totalFotos +
      '</div><div class="stat-label">Fotos</div></div>' +
      '<div class="stat-card"><div class="stat-valor">URL</div><div class="stat-label">Fotos</div></div></div>' +
      '<div style="display:flex;gap:10px;margin-bottom:28px;flex-wrap:wrap">' +
      '<button class="btn-primario" data-go="nova-galeria" style="border-radius:10px">+ Nova galeria</button>' +
      '<button class="btn-primario" data-go="novo-cliente" style="border-radius:10px;background:#0a4a8a">+ Novo cliente</button></div>' +
      '<div class="lista-card">' +
      (galerias.length === 0
        ? '<p style="padding:24px;text-align:center;color:#5a6a7a;font-weight:500">Nenhuma galeria.</p>'
        : galerias
            .slice(0, 8)
            .map(function (g) {
              return (
                '<a href="#" class="lista-item" data-abrir="' +
                esc(g.id) +
                '"><img class="lista-thumb" src="' +
                esc(g.capa || "") +
                '" alt="" onerror="this.style.background=\'#e8e4df\'" /><div class="lista-info"><div class="lista-nome">' +
                esc(g.nome) +
                '</div><div class="lista-meta">' +
                esc(g.cliente || "") +
                " · " +
                (g.fotos ? g.fotos.length : 0) +
                " fotos</div></div></a>"
              );
            })
            .join("")) +
      "</div>"
    );
  }

  function tplGalerias() {
    return (
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:6px">' +
      '<h1 class="admin-titulo" style="margin:0">Galerias</h1>' +
      '<button class="btn-primario" data-go="nova-galeria" style="border-radius:10px">+ Nova</button></div>' +
      '<p class="admin-sub">Todas as galerias</p><div class="lista-card">' +
      (galerias.length === 0
        ? '<p style="padding:24px;text-align:center;color:#5a6a7a">Nenhuma galeria.</p>'
        : galerias
            .map(function (g) {
              return (
                '<div class="lista-item">' +
                '<a href="#" data-abrir="' +
                esc(g.id) +
                '" style="display:flex;align-items:center;gap:14px;flex:1;min-width:0">' +
                '<img class="lista-thumb" src="' +
                esc(g.capa || "") +
                '" alt="" onerror="this.style.background=\'#e8e4df\'" /><div class="lista-info"><div class="lista-nome">' +
                esc(g.nome) +
                '</div><div class="lista-meta">' +
                esc(g.cliente || "—") +
                " · /g/" +
                esc(g.slug) +
                "</div></div></a>" +
                '<button type="button" data-editar-galeria="' +
                esc(g.id) +
                '" style="font-size:12px;font-weight:700;color:#032e5e;padding:6px 10px">Editar</button></div>'
              );
            })
            .join("")) +
      "</div>"
    );
  }

  function tplClientes() {
    return (
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:6px">' +
      '<h1 class="admin-titulo" style="margin:0">Clientes</h1>' +
      '<button class="btn-primario" data-go="novo-cliente" style="border-radius:10px">+ Novo</button></div>' +
      '<p class="admin-sub">' +
      clientes.length +
      " cliente(s)</p><div class=\"lista-card\">" +
      (clientes.length === 0
        ? '<p style="padding:24px;text-align:center;color:#5a6a7a">Nenhum cliente.</p>'
        : clientes
            .map(function (c) {
              return (
                '<div class="lista-item">' +
                '<div style="width:44px;height:44px;border-radius:50%;background:#afe3f4;display:flex;align-items:center;justify-content:center;font-weight:800;color:#032e5e">' +
                esc((c.nome || "?").charAt(0).toUpperCase()) +
                '</div><div class="lista-info"><div class="lista-nome">' +
                esc(c.nome) +
                '</div><div class="lista-meta">' +
                esc(c.email || "") +
                " · " +
                esc(c.telefone || "") +
                "</div></div>" +
                '<button type="button" data-editar-cliente="' +
                esc(c.id) +
                '" style="font-size:12px;font-weight:700;color:#032e5e;padding:6px 8px">Editar</button>' +
                '<button type="button" data-excluir-cliente="' +
                esc(c.id) +
                '" style="color:#dc2626;font-size:12px;font-weight:700;padding:6px 8px">Excluir</button></div>'
              );
            })
            .join("")) +
      "</div>"
    );
  }

  function tplFormCliente(id) {
    var c = id
      ? clientes.find(function (x) {
          return x.id === id;
        })
      : null;
    return (
      '<button class="btn-icon" data-go="clientes" style="margin-bottom:16px;border-radius:8px;width:auto;padding:8px 14px;font-size:13px;font-weight:700">← Voltar</button>' +
      '<h1 class="admin-titulo">' +
      (c ? "Editar cliente" : "Novo cliente") +
      "</h1>" +
      '<form id="form-cliente" data-id="' +
      esc(c ? c.id : "") +
      '" style="background:#fff;border:1px solid var(--borda);border-radius:14px;padding:24px;max-width:480px">' +
      '<div class="form-grupo"><label class="form-label" for="cli-nome">Nome *</label>' +
      '<input class="form-input" id="cli-nome" required value="' +
      esc(c ? c.nome : "") +
      '" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="cli-email">E-mail</label>' +
      '<input class="form-input" id="cli-email" type="email" value="' +
      esc(c ? c.email : "") +
      '" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="cli-tel">Telefone</label>' +
      '<input class="form-input" id="cli-tel" value="' +
      esc(c ? c.telefone : "") +
      '" /></div>' +
      '<button type="submit" class="btn-primario" style="border-radius:10px;width:100%;justify-content:center;padding:14px">Salvar</button></form>'
    );
  }

  function tplFormGaleria(id) {
    var g = id
      ? galerias.find(function (x) {
          return x.id === id;
        })
      : null;
    var opts = clientes
      .map(function (c) {
        var sel = g && g.cliente === c.nome ? " selected" : "";
        return (
          '<option value="' +
          esc(c.nome) +
          '"' +
          sel +
          ">" +
          esc(c.nome) +
          "</option>"
        );
      })
      .join("");
    var catsText = "";
    if (g && g.categorias && g.categorias.length) {
      catsText = g.categorias
        .map(function (c) {
          return c.nome;
        })
        .join(", ");
    }
    return (
      '<button class="btn-icon" data-go="' +
      (g ? "galeria:" + g.id : "galerias") +
      '" style="margin-bottom:16px;border-radius:8px;width:auto;padding:8px 14px;font-size:13px;font-weight:700">← Voltar</button>' +
      '<h1 class="admin-titulo">' +
      (g ? "Editar galeria" : "Nova galeria") +
      "</h1>" +
      '<form id="form-galeria" data-id="' +
      esc(g ? g.id : "") +
      '" style="background:#fff;border:1px solid var(--borda);border-radius:14px;padding:24px;max-width:520px">' +
      '<div class="form-grupo"><label class="form-label" for="gal-nome">Nome *</label>' +
      '<input class="form-input" id="gal-nome" required value="' +
      esc(g ? g.nome : "") +
      '" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="gal-cliente">Cliente *</label>' +
      (clientes.length
        ? '<select class="form-input" id="gal-cliente" required><option value="">Selecione...</option>' +
          opts +
          "</select>"
        : '<p style="font-size:13px;color:#5a6a7a">Cadastre um cliente antes.</p>') +
      "</div>" +
      '<div class="form-grupo"><label class="form-label" for="gal-slug">Slug (link)</label>' +
      '<input class="form-input" id="gal-slug" value="' +
      esc(g ? g.slug : "") +
      '" placeholder="casamento-maria" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="gal-data">Data</label>' +
      '<input class="form-input" id="gal-data" type="date" value="' +
      esc(g && g.data_evento ? g.data_evento : "") +
      '" /></div>' +
      '<div class="form-grupo"><label class="form-label" for="gal-capa">URL da capa</label>' +
      '<input class="form-input" id="gal-capa" type="url" value="' +
      esc(g ? g.capa || "" : "") +
      '" placeholder="https://..." /></div>' +
      '<div class="form-grupo"><label class="form-label" for="gal-msg">Mensagem</label>' +
      '<textarea class="form-input" id="gal-msg">' +
      esc(g ? g.mensagem || "" : "") +
      "</textarea></div>" +
      '<div class="form-grupo"><label class="form-check"><input type="checkbox" id="gal-cats"' +
      (g && g.tem_categorias ? " checked" : "") +
      " /> Esta galeria possui categorias</label></div>" +
      '<div class="form-grupo" id="wrap-cats-nomes"><label class="form-label" for="gal-cats-nomes">Nomes das categorias (separados por vírgula)</label>' +
      '<input class="form-input" id="gal-cats-nomes" placeholder="Pré-Wedding, Cerimônia, Festa" value="' +
      esc(catsText) +
      '" />' +
      '<p style="font-size:12px;color:#5a6a7a;margin-top:6px">Ex.: Pré-Wedding, Cerimônia, Festa</p></div>' +
      '<div class="form-grupo"><label class="form-check"><input type="checkbox" id="gal-download"' +
      (!g || g.download !== false ? " checked" : "") +
      " /> Permitir download</label></div>" +
      '<button type="submit" class="btn-primario" style="border-radius:10px;width:100%;justify-content:center;padding:14px">Salvar galeria</button></form>'
    );
  }

  function tplDetalhe(id) {
    var g = galerias.find(function (x) {
      return x.id === id;
    });
    if (!g) return "<p>Galeria não encontrada</p>";
    var base = location.href.replace(/admin\/?.*$/, "");
    var linkCliente = base + "g/index.html?slug=" + encodeURIComponent(g.slug);
    var fotos = g.fotos || [];
    var catOpts = (g.categorias || [])
      .map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.nome) + "</option>";
      })
      .join("");
    return (
      '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">' +
      '<button class="btn-icon" data-go="galerias" style="border-radius:8px;width:auto;padding:8px 14px;font-size:13px;font-weight:700">← Voltar</button>' +
      '<button class="btn-primario" data-editar-galeria="' +
      esc(g.id) +
      '" style="border-radius:10px;background:#0a4a8a">Editar dados</button></div>' +
      '<h1 class="admin-titulo">' +
      esc(g.nome) +
      "</h1>" +
      '<p class="admin-sub">' +
      esc(g.cliente || "") +
      " · " +
      formatarData(g.data_evento) +
      " · " +
      fotos.length +
      " fotos" +
      (g.tem_categorias ? " · com categorias" : "") +
      "</p>" +
      (g.capa
        ? '<img src="' +
          esc(g.capa) +
          '" alt="" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;margin-bottom:20px" onerror="this.style.display=\'none\'" />'
        : "") +
      '<div style="background:#fff;border:1px solid var(--borda);border-radius:12px;padding:20px;margin-bottom:16px">' +
      '<h3 style="font-size:14px;font-weight:800;margin-bottom:6px">Link do cliente</h3>' +
      '<div class="link-box" id="link-cliente">' +
      esc(linkCliente) +
      "</div>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn-primario" id="btn-copiar" style="border-radius:10px">Copiar</button>' +
      '<a class="btn-primario" style="border-radius:10px;background:#0a4a8a" href="' +
      esc(linkCliente) +
      '" target="_blank">Visualizar</a></div></div>' +
      '<div style="background:#fff;border:1px solid var(--borda);border-radius:12px;padding:20px;margin-bottom:16px">' +
      '<h3 style="font-size:14px;font-weight:800;margin-bottom:6px">Adicionar fotografia (URL)</h3>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<input class="form-input" id="foto-url" type="url" placeholder="https://... imagem direta" />' +
      (g.tem_categorias && g.categorias && g.categorias.length
        ? '<select class="form-input" id="foto-cat"><option value="">Sem categoria</option>' +
          catOpts +
          "</select>"
        : "") +
      '<button class="btn-primario" id="btn-add-foto" style="border-radius:10px;align-self:flex-start">Adicionar foto</button></div></div>' +
      '<div style="background:#fff;border:1px solid var(--borda);border-radius:12px;padding:20px;margin-bottom:16px">' +
      '<h3 style="font-size:14px;font-weight:800;margin-bottom:12px">Fotos (' +
      fotos.length +
      ")</h3>" +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px">' +
      fotos
        .map(function (f) {
          var catNome = "";
          if (f.categoria && g.categorias) {
            var cc = g.categorias.find(function (c) {
              return c.id === f.categoria;
            });
            if (cc) catNome = cc.nome;
          }
          return (
            '<div style="position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;background:#e8e4df">' +
            '<img src="' +
            esc(f.url) +
            '" alt="" style="width:100%;height:100%;object-fit:cover" />' +
            (catNome
              ? '<span style="position:absolute;bottom:4px;left:4px;font-size:9px;background:rgba(3,46,94,.8);color:#fff;padding:2px 5px;border-radius:4px">' +
                esc(catNome) +
                "</span>"
              : "") +
            '<button type="button" data-capa-foto="' +
            esc(f.id) +
            '" style="position:absolute;top:4px;left:4px;padding:3px 6px;border-radius:6px;background:rgba(3,46,94,.85);color:#fff;font-size:10px;font-weight:700">Capa</button>' +
            '<button type="button" data-del-foto="' +
            esc(f.id) +
            '" style="position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;background:rgba(220,38,38,.9);color:#fff;font-weight:700">×</button></div>'
          );
        })
        .join("") +
      "</div></div>" +
      '<button id="btn-excluir" style="width:100%;padding:14px;border-radius:12px;border:1.5px solid #fecaca;background:#fef2f2;color:#dc2626;font-weight:700">Excluir galeria</button>'
    );
  }

  function parseCategorias(texto) {
    return (texto || "")
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean)
      .map(function (nome, i) {
        return { id: "c" + (i + 1) + "_" + slugify(nome).slice(0, 12), nome: nome, ordem: i };
      });
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

    $$("[data-editar-cliente]").forEach(function (btn) {
      btn.onclick = function () {
        pagina = "editar-cliente:" + btn.dataset.editarCliente;
        render();
      };
    });

    $$("[data-editar-galeria]").forEach(function (btn) {
      btn.onclick = function () {
        pagina = "editar-galeria:" + btn.dataset.editarGaleria;
        render();
      };
    });

    var formCli = $("#form-cliente");
    if (formCli) {
      formCli.addEventListener("submit", function (e) {
        e.preventDefault();
        var nome = $("#cli-nome").value.trim();
        if (!nome) return;
        var id = formCli.getAttribute("data-id") || "";
        var btn = formCli.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Salvando...";
        }
        salvarCliente({
          id: id || undefined,
          nome: nome,
          email: $("#cli-email").value.trim(),
          telefone: $("#cli-tel").value.trim(),
        })
          .then(function () {
            return carregarTudo();
          })
          .then(function () {
            alert("Cliente salvo!");
            pagina = "clientes";
            render();
          })
          .catch(function (err) {
            alert(msgErro(err));
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Salvar";
            }
          });
      });
    }

    $$("[data-excluir-cliente]").forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm("Excluir cliente?")) return;
        excluirCliente(btn.dataset.excluirCliente)
          .then(function () {
            return carregarTudo();
          })
          .then(render)
          .catch(function (err) {
            alert(msgErro(err));
          });
      };
    });

    var formGal = $("#form-galeria");
    if (formGal) {
      var nomeInput = $("#gal-nome");
      var slugInput = $("#gal-slug");
      if (nomeInput && slugInput && !formGal.getAttribute("data-id")) {
        nomeInput.addEventListener("input", function () {
          if (!slugInput.dataset.manual)
            slugInput.value = slugify(nomeInput.value);
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
        var idExistente = formGal.getAttribute("data-id") || "";
        var slug = $("#gal-slug").value.trim() || slugify(nome);
        if (
          galerias.some(function (g) {
            return g.slug === slug && g.id !== idExistente;
          })
        ) {
          slug += "-" + Date.now().toString(36).slice(-4);
        }
        var temCats = $("#gal-cats") && $("#gal-cats").checked;
        var categorias = temCats
          ? parseCategorias($("#gal-cats-nomes").value)
          : [];
        var gExistente = idExistente
          ? galerias.find(function (x) {
              return x.id === idExistente;
            })
          : null;
        var fotos = gExistente && gExistente.fotos ? gExistente.fotos : [];
        var btn = formGal.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Salvando...";
        }
        salvarGaleria(
          {
            slug: slug,
            nome: nome,
            cliente: cliente,
            data_evento: $("#gal-data").value || null,
            mensagem: $("#gal-msg").value.trim() || null,
            capa: $("#gal-capa").value.trim() || null,
            tem_categorias: temCats,
            categorias: categorias,
            download: $("#gal-download").checked,
            fotos: fotos,
          },
          idExistente || null
        )
          .then(function (id) {
            return carregarTudo().then(function () {
              return id;
            });
          })
          .then(function (id) {
            alert("Galeria salva!");
            pagina = "galeria:" + id;
            render();
          })
          .catch(function (err) {
            alert(msgErro(err));
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Salvar galeria";
            }
          });
      });
    }

    $("#btn-copiar") &&
      $("#btn-copiar").addEventListener("click", function () {
        var link = $("#link-cliente") && $("#link-cliente").textContent;
        if (link && navigator.clipboard) {
          navigator.clipboard.writeText(link).then(function () {
            $("#btn-copiar").textContent = "Copiado!";
            setTimeout(function () {
              $("#btn-copiar").textContent = "Copiar";
            }, 1500);
          });
        }
      });

    $("#btn-add-foto") &&
      $("#btn-add-foto").addEventListener("click", function () {
        var url = ($("#foto-url") && $("#foto-url").value.trim()) || "";
        if (!url) return alert("Cole a URL da imagem");
        var id = pagina.split(":")[1];
        var g = galerias.find(function (x) {
          return x.id === id;
        });
        if (!g) return;
        if (!g.fotos) g.fotos = [];
        var catEl = $("#foto-cat");
        var cat = catEl ? catEl.value || null : null;
        g.fotos.push({
          id: uid("f"),
          url: url,
          original: url,
          name: "",
          categoria: cat,
          destaque: false,
        });
        var patch = { fotos: g.fotos };
        if (!g.capa) patch.capa = url;
        atualizarGaleria(id, patch)
          .then(function () {
            return carregarTudo();
          })
          .then(function () {
            render();
          })
          .catch(function (err) {
            alert(msgErro(err));
          });
      });

    $$("[data-capa-foto]").forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        var fid = btn.dataset.capaFoto;
        var id = pagina.split(":")[1];
        var g = galerias.find(function (x) {
          return x.id === id;
        });
        if (!g) return;
        var foto = (g.fotos || []).find(function (f) {
          return f.id === fid;
        });
        if (!foto || !foto.url) return;
        atualizarGaleria(id, { capa: foto.url })
          .then(function () {
            return carregarTudo();
          })
          .then(function () {
            alert("Capa definida!");
            render();
          })
          .catch(function (err) {
            alert(msgErro(err));
          });
      };
    });

    $$("[data-del-foto]").forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm("Remover foto?")) return;
        var fid = btn.dataset.delFoto;
        var id = pagina.split(":")[1];
        var g = galerias.find(function (x) {
          return x.id === id;
        });
        if (!g) return;
        g.fotos = (g.fotos || []).filter(function (f) {
          return f.id !== fid;
        });
        atualizarGaleria(id, { fotos: g.fotos })
          .then(function () {
            return carregarTudo();
          })
          .then(render)
          .catch(function (err) {
            alert(msgErro(err));
          });
      };
    });

    $("#btn-excluir") &&
      $("#btn-excluir").addEventListener("click", function () {
        if (!confirm("Excluir galeria?")) return;
        var id = pagina.split(":")[1];
        excluirGaleria(id)
          .then(function () {
            return carregarTudo();
          })
          .then(function () {
            pagina = "galerias";
            render();
          })
          .catch(function (err) {
            alert(msgErro(err));
          });
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
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Entrando...";
        }
        if (!auth) {
          if (erro) {
            erro.style.display = "block";
            erro.textContent = "Firebase não inicializou.";
          }
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Entrar";
          }
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
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Entrar";
          }
        });
      });
    }

    if (!auth || !db) {
      var erro = $("#erro");
      if (erro) {
        erro.style.display = "block";
        erro.textContent = "Firebase não inicializou. Confira firebase-config.js";
      }
      return;
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
