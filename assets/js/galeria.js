/* Galeria Virtual — Cliente (Firestore + URL) */
(function () {
  "use strict";

  var $ = function (s, ctx) {
    return (ctx || document).querySelector(s);
  };
  var $$ = function (s, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(s));
  };

  var galeria = null;
  var fotosFiltradas = [];
  var indiceLB = 0;
  var filtroAtual = ""; // "" | "favoritas" | categoriaId
  var favoritos = [];
  try {
    favoritos = JSON.parse(localStorage.getItem("gv_favs") || "[]");
  } catch (e) {
    favoritos = [];
  }

  function getSlug() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("slug")) return params.get("slug");
    var parts = window.location.pathname.split("/").filter(Boolean);
    var idx = parts.indexOf("g");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1].replace(".html", "");
    return null;
  }

  function formatarData(str) {
    if (!str) return "";
    return new Date(str + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  function favKey() {
    return "gv_favs_" + (galeria && galeria.slug ? galeria.slug : "global");
  }

  function carregarFavs() {
    try {
      favoritos = JSON.parse(localStorage.getItem(favKey()) || "[]");
    } catch (e) {
      favoritos = [];
    }
  }

  function salvarFavs() {
    localStorage.setItem(favKey(), JSON.stringify(favoritos));
  }

  function mostrarErro() {
    var main = $("main") || document.body;
    main.innerHTML =
      '<div style="min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center">' +
      '<h1 style="font-family:Montserrat,sans-serif;font-size:24px;font-weight:800;color:#032e5e">Galeria não encontrada</h1>' +
      '<p style="color:#5a6a7a;font-size:14px">Link incorreto ou galeria removida.</p></div>';
  }

  async function carregarGaleria(slug) {
    if (typeof db !== "undefined" && db) {
      try {
        var snap = await db
          .collection(COL_GALERIAS)
          .where("slug", "==", slug)
          .limit(1)
          .get();
        if (!snap.empty) {
          var doc = snap.docs[0];
          return Object.assign({ id: doc.id }, doc.data());
        }
      } catch (e) {
        console.warn("Firestore:", e);
      }
    }
    try {
      var res = await fetch("../data/galerias.json");
      var lista = await res.json();
      return (
        lista.find(function (g) {
          return g.slug === slug;
        }) || null
      );
    } catch (e) {
      return null;
    }
  }

  async function init() {
    var slug = getSlug();
    if (!slug) return mostrarErro();
    galeria = await carregarGaleria(slug);
    if (!galeria) return mostrarErro();
    carregarFavs();
    renderHero();
    renderCategorias();
    filtrarFotos("");
    bindEventos();
    requestAnimationFrame(function () {
      var h = $(".hero");
      if (h) h.classList.add("loaded");
    });
  }

  function renderHero() {
    var hero = $(".hero");
    if (!hero) return;
    var img = hero.querySelector(".hero-img");
    if (img && galeria.capa) {
      img.src = galeria.capa;
      img.alt = galeria.nome;
      img.onload = function () {
        img.classList.add("carregada");
      };
    }
    if ($(".hero-data"))
      $(".hero-data").textContent = formatarData(galeria.data_evento);
    if ($(".hero-titulo")) $(".hero-titulo").textContent = galeria.nome;
    if ($(".hero-cliente"))
      $(".hero-cliente").textContent = galeria.cliente || "";
    if ($(".hero-mensagem")) {
      if (galeria.mensagem) $(".hero-mensagem").textContent = galeria.mensagem;
      else $(".hero-mensagem").style.display = "none";
    }
    document.title = galeria.nome + " — Bia Sousa";
  }

  function renderCategorias() {
    var wrap = $(".categorias");
    if (!wrap) return;

    var html =
      '<button type="button" class="cat-btn ativo" data-cat="">Todas</button>';

    if (galeria.tem_categorias && galeria.categorias && galeria.categorias.length) {
      var cats = galeria.categorias.slice().sort(function (a, b) {
        return (a.ordem || 0) - (b.ordem || 0);
      });
      html += cats
        .map(function (c) {
          return (
            '<button type="button" class="cat-btn" data-cat="' +
            esc(c.id) +
            '">' +
            esc(c.nome) +
            "</button>"
          );
        })
        .join("");
    }

    html +=
      '<button type="button" class="cat-btn fav-tab" data-cat="favoritas">♥ Favoritas</button>';

    wrap.style.display = "";
    wrap.innerHTML = html;

    wrap.onclick = function (e) {
      var btn = e.target.closest(".cat-btn");
      if (!btn) return;
      $$(".cat-btn", wrap).forEach(function (b) {
        b.classList.remove("ativo");
      });
      btn.classList.add("ativo");
      filtrarFotos(btn.dataset.cat || "");
    };
  }

  function filtrarFotos(filtro) {
    filtroAtual = filtro || "";
    var todas = galeria.fotos || [];
    if (filtroAtual === "favoritas") {
      fotosFiltradas = todas.filter(function (f) {
        return favoritos.indexOf(f.id) >= 0;
      });
    } else if (filtroAtual) {
      fotosFiltradas = todas.filter(function (f) {
        return f.categoria === filtroAtual;
      });
    } else {
      fotosFiltradas = todas.slice();
    }
    renderGrid();
  }

  function renderGrid() {
    var grid = $(".grid");
    var contador = $(".contador-num");
    if (!grid) return;
    if (contador) {
      var n = fotosFiltradas.length;
      contador.textContent = n + " fotografia" + (n !== 1 ? "s" : "");
    }
    if (!fotosFiltradas.length) {
      grid.innerHTML =
        '<p style="grid-column:1/-1;padding:40px;text-align:center;color:#5a6a7a;font-weight:500">' +
        (filtroAtual === "favoritas"
          ? "Nenhuma foto favoritada ainda. Toque no coração nas fotos."
          : "Nenhuma fotografia nesta seleção.") +
        "</p>";
      return;
    }
    grid.innerHTML = fotosFiltradas
      .map(function (f, i) {
        var fav = favoritos.indexOf(f.id) >= 0;
        return (
          '<div class="foto" data-index="' +
          i +
          '"><img src="' +
          f.url +
          '" alt="" loading="lazy" />' +
          '<button type="button" class="foto-fav ' +
          (fav ? "ativo" : "") +
          '" data-id="' +
          f.id +
          '">' +
          (fav ? "♥" : "♡") +
          "</button></div>"
        );
      })
      .join("");
    $$(".foto img", grid).forEach(function (img) {
      if (img.complete) img.classList.add("carregada");
      else
        img.onload = function () {
          img.classList.add("carregada");
        };
    });
    grid.onclick = function (e) {
      var favBtn = e.target.closest(".foto-fav");
      if (favBtn) {
        e.stopPropagation();
        toggleFav(favBtn.dataset.id, favBtn);
        return;
      }
      var foto = e.target.closest(".foto");
      if (foto) abrirLightbox(+foto.dataset.index);
    };
  }

  function toggleFav(id, btn) {
    var idx = favoritos.indexOf(id);
    if (idx >= 0) {
      favoritos.splice(idx, 1);
      if (btn) {
        btn.classList.remove("ativo");
        btn.textContent = "♡";
      }
    } else {
      favoritos.push(id);
      if (btn) {
        btn.classList.add("ativo");
        btn.textContent = "♥";
      }
    }
    salvarFavs();
    if (filtroAtual === "favoritas") filtrarFotos("favoritas");
  }

  function abrirLightbox(index) {
    indiceLB = index;
    var lb = $(".lightbox");
    if (!lb) return;
    lb.classList.add("aberto");
    document.body.style.overflow = "hidden";
    atualizarLB();
  }

  function fecharLightbox() {
    var lb = $(".lightbox");
    if (lb) lb.classList.remove("aberto");
    document.body.style.overflow = "";
  }

  function atualizarLB() {
    var f = fotosFiltradas[indiceLB];
    if (!f) return;
    var img = $(".lb-img");
    var cont = $(".lb-contador");
    if (img) {
      img.style.opacity = "0";
      img.src = f.url;
      img.onload = function () {
        img.style.transition = "opacity 0.3s";
        img.style.opacity = "1";
      };
    }
    if (cont) cont.textContent = indiceLB + 1 + " / " + fotosFiltradas.length;
  }

  function navegarLB(dir) {
    if (!fotosFiltradas.length) return;
    indiceLB += dir;
    if (indiceLB < 0) indiceLB = fotosFiltradas.length - 1;
    if (indiceLB >= fotosFiltradas.length) indiceLB = 0;
    atualizarLB();
  }

  /** Força download imediato (blob) quando possível */
  async function downloadFoto() {
    var f = fotosFiltradas[indiceLB];
    if (!f || galeria.download === false) return;
    var href = f.original || f.url;
    if (!href) return;
    var nome = f.name || "foto-" + (f.id || indiceLB + 1) + ".jpg";

    try {
      var res = await fetch(href, { mode: "cors" });
      if (!res.ok) throw new Error("fetch fail");
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2500);
      return;
    } catch (e) {
      // CORS: abre em nova aba / download nativo
      var a2 = document.createElement("a");
      a2.href = href;
      a2.download = nome;
      a2.target = "_blank";
      a2.rel = "noopener";
      document.body.appendChild(a2);
      a2.click();
      a2.remove();
    }
  }

  async function compartilharFoto() {
    var f = fotosFiltradas[indiceLB];
    if (!f) return;
    var pageUrl = window.location.href;
    var titulo = (galeria && galeria.nome) || "Galeria";
    var texto = titulo + " — foto";

    try {
      if (navigator.share) {
        // Tenta compartilhar arquivo se CORS permitir
        try {
          var res = await fetch(f.url, { mode: "cors" });
          if (res.ok) {
            var blob = await res.blob();
            var file = new File(
              [blob],
              f.name || "foto.jpg",
              { type: blob.type || "image/jpeg" }
            );
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: titulo,
                text: texto,
              });
              return;
            }
          }
        } catch (errShareFile) {}
        await navigator.share({ title: titulo, text: texto, url: pageUrl });
        return;
      }
    } catch (errShare) {
      if (errShare && errShare.name === "AbortError") return;
    }

    // Fallback: copiar link da página da galeria
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(pageUrl);
        alert("Link da galeria copiado!");
        return;
      }
    } catch (e) {}
    prompt("Copie o link da galeria:", pageUrl);
  }

  function compartilharGaleria() {
    var pageUrl = window.location.href;
    var titulo = (galeria && galeria.nome) || "Galeria";
    if (navigator.share) {
      navigator
        .share({ title: titulo, url: pageUrl })
        .catch(function () {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(pageUrl).then(function () {
        alert("Link copiado!");
      });
    } else {
      prompt("Copie o link:", pageUrl);
    }
  }

  function bindEventos() {
    window.addEventListener("scroll", function () {
      var t = $(".topbar");
      if (t) t.classList.toggle("scrolled", window.scrollY > 30);
    });
    $(".lb-fechar") &&
      $(".lb-fechar").addEventListener("click", fecharLightbox);
    $(".lb-prev") &&
      $(".lb-prev").addEventListener("click", function () {
        navegarLB(-1);
      });
    $(".lb-next") &&
      $(".lb-next").addEventListener("click", function () {
        navegarLB(1);
      });
    $(".lb-download") &&
      $(".lb-download").addEventListener("click", function () {
        downloadFoto();
      });
    $(".lb-share") &&
      $(".lb-share").addEventListener("click", function () {
        compartilharFoto();
      });
    $(".btn-share") &&
      $(".btn-share").addEventListener("click", function () {
        compartilharGaleria();
      });
    document.addEventListener("keydown", function (e) {
      if (!$(".lightbox.aberto")) return;
      if (e.key === "Escape") fecharLightbox();
      if (e.key === "ArrowLeft") navegarLB(-1);
      if (e.key === "ArrowRight") navegarLB(1);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
