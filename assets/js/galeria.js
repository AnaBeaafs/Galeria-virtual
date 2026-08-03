/* Galeria Virtual — Cliente (Firestore + URLs do Storage) */
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

  function mostrarErro() {
    var main = $("main") || document.body;
    main.innerHTML =
      '<div style="min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center">' +
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
    renderHero();
    renderCategorias();
    filtrarFotos(null);
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
    document.title = galeria.nome + " — Galeria";
  }

  function renderCategorias() {
    var wrap = $(".categorias");
    if (!wrap) return;
    if (!galeria.tem_categorias || !(galeria.categorias && galeria.categorias.length)) {
      wrap.style.display = "none";
      return;
    }
    wrap.style.display = "";
    var cats = galeria.categorias.slice().sort(function (a, b) {
      return (a.ordem || 0) - (b.ordem || 0);
    });
    wrap.innerHTML =
      '<button class="cat-btn ativo" data-cat="">Todas</button>' +
      cats
        .map(function (c) {
          return (
            '<button class="cat-btn" data-cat="' +
            esc(c.id) +
            '">' +
            esc(c.nome) +
            "</button>"
          );
        })
        .join("");
    wrap.onclick = function (e) {
      var btn = e.target.closest(".cat-btn");
      if (!btn) return;
      $$(".cat-btn", wrap).forEach(function (b) {
        b.classList.remove("ativo");
      });
      btn.classList.add("ativo");
      filtrarFotos(btn.dataset.cat || null);
    };
  }

  function filtrarFotos(catId) {
    if (!catId) fotosFiltradas = (galeria.fotos || []).slice();
    else
      fotosFiltradas = (galeria.fotos || []).filter(function (f) {
        return f.categoria === catId;
      });
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
    grid.innerHTML = fotosFiltradas
      .map(function (f, i) {
        var fav = favoritos.indexOf(f.id) >= 0;
        return (
          '<div class="foto" data-index="' +
          i +
          '"><img src="' +
          f.url +
          '" alt="" loading="lazy" />' +
          '<button class="foto-fav ' +
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
        var id = favBtn.dataset.id;
        var idx = favoritos.indexOf(id);
        if (idx >= 0) {
          favoritos.splice(idx, 1);
          favBtn.classList.remove("ativo");
          favBtn.textContent = "♡";
        } else {
          favoritos.push(id);
          favBtn.classList.add("ativo");
          favBtn.textContent = "♥";
        }
        localStorage.setItem("gv_favs", JSON.stringify(favoritos));
        return;
      }
      var foto = e.target.closest(".foto");
      if (foto) abrirLightbox(+foto.dataset.index);
    };
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
    indiceLB += dir;
    if (indiceLB < 0) indiceLB = fotosFiltradas.length - 1;
    if (indiceLB >= fotosFiltradas.length) indiceLB = 0;
    atualizarLB();
  }

  /** Download da URL original do Storage (arquivo completo) */
  function downloadFoto() {
    var f = fotosFiltradas[indiceLB];
    if (!f || galeria.download === false) return;
    var href = f.original || f.url;
    if (!href) return;
    var a = document.createElement("a");
    a.href = href;
    a.download = f.name || "foto-" + f.id + ".jpg";
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
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
      $(".lb-download").addEventListener("click", downloadFoto);
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
