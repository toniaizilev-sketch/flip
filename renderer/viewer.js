(function () {
  "use strict";

  var COMICS = [];
  var AUTO_READ = false;

  var MIN_T = 4, MAX_T = 100, STEP_T = 4, RESET_T = 15;
  var MIN_W = 15, MAX_W = 200, STEP_W = 5, RESET_W = 96, EDGE = 110;

  var searchEl = document.getElementById("search");
  var listEl = document.getElementById("list");
  var gridEl = document.getElementById("grid");
  var readerEl = document.getElementById("reader");
  var posEl = document.getElementById("pos");
  var slider = document.getElementById("size");
  var pct = document.getElementById("pct");
  var fsBtn = document.getElementById("fs");
  var backBtn = document.getElementById("back");
  var prevBtn = document.getElementById("prev");
  var nextBtn = document.getElementById("next");
  var dock = document.getElementById("dock");
  var rightEl = document.getElementById("right");
  var browseEl = document.getElementById("browse");
  var helpEl = document.getElementById("help");
  var focusEl = document.getElementById("focus");
  var focusImg = document.getElementById("focusImg");
  var focusCaption = document.getElementById("focusCaption");

  var sel = -1, visible = [], mode = "browse";
  var cur = null;
  var tw = RESET_T, rw = RESET_W;
  var ioGrid = null, ioReader = null, loadTimer = 0;
  var heldJ = false, heldK = false, scrollLeft = 0, scrollRaf = 0;
  var heldN = false, heldU = false, galleryRaf = 0;
  var posRaf = 0;
  var near = false, sliding = false;
  var current = 0;
  var focus = false;
  var lastRead = {};
  var wheelAdvancePending = false;

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function fileURL(dir, rel) {
    return "file://" + dir.split("/").map(encodeURIComponent).join("/")
      + "/" + rel.split("/").map(encodeURIComponent).join("/");
  }

  function activate(img) {
    if (!img || img.getAttribute("src")) return;
    var src = img.getAttribute("data-src");
    if (!src) return;
    img.addEventListener("load", function () { img.classList.remove("pending"); }, { once: true });
    img.addEventListener("error", function () { img.classList.remove("pending"); }, { once: true });
    img.src = src;
  }

  function makeObserver(cb) {
    return new IntersectionObserver(cb, { rootMargin: "600px 0px 600px 0px" });
  }

  function observeGrid() {
    if (ioGrid) ioGrid.disconnect();
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(gridEl.querySelectorAll("img"), activate);
      return;
    }
    ioGrid = makeObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { activate(en.target); ioGrid.unobserve(en.target); }
      });
    });
    Array.prototype.forEach.call(gridEl.querySelectorAll("img"), function (i) { ioGrid.observe(i); });
  }

  function observeReader() {
    if (ioReader) ioReader.disconnect();
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(readerEl.querySelectorAll("img"), activate);
      return;
    }
    ioReader = makeObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { activate(en.target); ioReader.unobserve(en.target); }
      });
    });
    Array.prototype.forEach.call(readerEl.querySelectorAll("img"), function (i) { ioReader.observe(i); });
  }

  // ---- browse ----

  function applyFilter() {
    var q = searchEl.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    visible = COMICS.filter(function (c) {
      var hay = (c.title + " " + c.author + " " + c.tags.join(" ")).toLowerCase();
      return q.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    sel = visible.length ? 0 : -1;
    renderList();
    select(sel, true);
  }

  function renderList() {
    listEl.innerHTML = "";
    visible.forEach(function (c, i) {
      var row = document.createElement("div");
      row.className = "row" + (i === sel ? " sel" : "");
      var t = document.createElement("div"); t.className = "t"; t.textContent = c.title;
      var a = document.createElement("div"); a.className = "a"; a.textContent = c.author;
      row.appendChild(t); row.appendChild(a);
      row.addEventListener("click", function () { select(i); });
      listEl.appendChild(row);
    });
  }

  function browsePos() {
    var c = visible[sel];
    if (!c) { posEl.textContent = "0/0"; return; }
    var s = (sel + 1) + "/" + visible.length + " — " + c.title;
    if (c.imgs.length) s += " · " + c.imgs.length + " pages";
    posEl.textContent = s;
  }

  function select(i, force) {
    if (i < 0 || i >= visible.length) return;
    if (sel === i && !force) return;
    sel = i;
    cur = visible[sel];
    var rows = listEl.children;
    for (var k = 0; k < rows.length; k++) rows[k].classList.toggle("sel", k === sel);
    if (rows[sel]) rows[sel].scrollIntoView({ block: "center" });
    browsePos();
    clearTimeout(loadTimer);
    loadTimer = setTimeout(showComic, 60);
  }

  function showComic() {
    var c = visible[sel];
    cur = c;
    gridEl.innerHTML = "";
    if (!c || !c.imgs.length) {
      gridEl.innerHTML = '<div id="empty">no images</div>';
      return;
    }
    rightEl.scrollTop = 0;
    c.imgs.forEach(function (rel, i) {
      var img = document.createElement("img");
      img.setAttribute("data-src", fileURL(c.dir, rel));
      img.setAttribute("data-index", String(i));
      img.className = "pending" + (i === lastRead[c.id] ? " last" : "");
      gridEl.appendChild(img);
    });
    observeGrid();
  }

  // ---- read ----

  function openReader(startIndex) {
    var c = cur;
    if (!c || !c.imgs.length) return;
    mode = "read";
    browseEl.style.display = "none";
    readerEl.style.display = "block";
    renderReader(startIndex);
    updateDock();
    scheduleReaderPos();
  }

  function renderReader(startIndex) {
    var c = cur;
    readerEl.innerHTML = "";
    readerEl.scrollTop = 0;
    c.imgs.forEach(function (rel, i) {
      var img = document.createElement("img");
      if (i < 6 || (typeof startIndex === "number" && i <= startIndex)) {
        img.src = fileURL(c.dir, rel);
      } else {
        img.setAttribute("data-src", fileURL(c.dir, rel));
        img.className = "pending";
      }
      readerEl.appendChild(img);
    });
    observeReader();
    if (typeof startIndex === "number") scrollToImage(startIndex);
  }

  function scrollToImage(index) {
    var imgs = readerEl.querySelectorAll("img");
    var target = imgs[index];
    if (!target) return;
    var waits = [];
    for (var i = 0; i <= index; i++) {
      (function (img) {
        if (img.complete && img.naturalWidth > 0) return;
        waits.push(new Promise(function (resolve) {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        }));
      })(imgs[i]);
    }
    function go() { readerEl.scrollTo(0, target.offsetTop); }
    if (waits.length) Promise.all(waits).then(go);
    else go();
  }

  function gotoComic(delta) {
    if (mode !== "read") return false;
    var target = sel + delta;
    if (target < 0 || target >= visible.length) return false;
    sel = target;
    cur = visible[sel];
    var rows = listEl.children;
    for (var k = 0; k < rows.length; k++) rows[k].classList.toggle("sel", k === sel);
    if (rows[sel]) rows[sel].scrollIntoView({ block: "nearest" });
    renderReader(0);
    updateDock();
    scheduleReaderPos();
    return true;
  }

  function backToBrowse() {
    lastRead[cur.id] = current;
    mode = "browse";
    readerEl.style.display = "none";
    browseEl.style.display = "flex";
    updateDock();
    highlightLastRead();
    browsePos();
  }

  function highlightLastRead() {
    var last = lastRead[cur.id];
    var imgs = gridEl.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].classList.toggle("last", Number(imgs[i].getAttribute("data-index")) === last);
    }
    if (typeof last === "number") {
      var t = gridEl.querySelector('img[data-index="' + last + '"]');
      if (t) t.scrollIntoView({ block: "center" });
    }
  }

  function readerPos() {
    posRaf = 0;
    var imgs = readerEl.querySelectorAll("img");
    var total = imgs.length;
    if (!total) { posEl.textContent = "0/0"; return; }
    var marker = window.innerHeight * 0.28;
    var index = 0, i, rect;
    for (i = 0; i < total; i++) {
      rect = imgs[i].getBoundingClientRect();
      if (rect.bottom >= marker) { index = i; break; }
      index = i;
    }
    current = index;
    var s = (index + 1) + "/" + total;
    if (cur) s += " — " + cur.title;
    posEl.textContent = s;
  }

  function scheduleReaderPos() {
    if (posRaf) return;
    if (focus) return;
    posRaf = requestAnimationFrame(readerPos);
  }

  function scrollTick() {
    var dir = (heldJ ? 1 : 0) - (heldK ? 1 : 0);
    if (dir) scrollLeft += dir * window.innerHeight * 0.028;
    var cap = window.innerHeight * 0.22;
    if (scrollLeft > cap) scrollLeft = cap;
    if (scrollLeft < -cap) scrollLeft = -cap;
    if (!dir && Math.abs(scrollLeft) < 0.4) {
      scrollLeft = 0; scrollRaf = 0; return;
    }
    var step = scrollLeft * 0.18;
    readerEl.scrollBy(0, step);
    scrollLeft -= step;
    if (step > 0 && atBottom()) gotoComic(1);
    scrollRaf = requestAnimationFrame(scrollTick);
  }

  function galleryTick() {
    var dir = (heldN ? 1 : 0) - (heldU ? 1 : 0);
    if (!dir) { galleryRaf = 0; return; }
    rightEl.scrollBy(0, dir * rightEl.clientHeight * 0.04);
    galleryRaf = requestAnimationFrame(galleryTick);
  }

  function atBottom() {
    return readerEl.scrollHeight > readerEl.clientHeight + 4
      && readerEl.scrollTop + readerEl.clientHeight >= readerEl.scrollHeight - 4;
  }

  function fullscreenActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function toggleFullscreen() {
    if (fullscreenActive()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
  }

  function updateFs() {
    fsBtn.classList.toggle("on", fullscreenActive());
  }

  function showHelp(on) { helpEl.classList.toggle("show", on); }
  function toggleHelp() { showHelp(!helpEl.classList.contains("show")); }

  function focusUpdate() {
    var url = fileURL(cur.dir, cur.imgs[current]);
    var name = decodeURIComponent(url.split("/").pop());
    focusImg.src = url;
    focusImg.alt = name;
    focusCaption.textContent = (current + 1) + " / " + cur.imgs.length + " — " + name;
  }

  function enterFocus() {
    if (!cur || !cur.imgs.length) return;
    heldJ = false; heldK = false;
    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = 0; }
    scrollLeft = 0;
    focus = true;
    document.body.classList.add("focus");
    focusEl.classList.add("show");
    focusUpdate();
  }

  function exitFocus() {
    if (!focus) return;
    focus = false;
    focusEl.classList.remove("show");
    document.body.classList.remove("focus");
    var imgs = readerEl.querySelectorAll("img");
    var target = imgs[current];
    if (target) readerEl.scrollTo(0, target.offsetTop);
  }

  function focusNav(dir) {
    if (!cur || !cur.imgs.length) return;
    if (dir > 0 && current >= cur.imgs.length - 1) {
      if (!gotoComic(1)) return;
      current = 0;
    } else if (dir < 0 && current <= 0) {
      if (!gotoComic(-1)) return;
      current = cur.imgs.length - 1;
    } else {
      current += dir;
    }
    focusUpdate();
  }

  // ---- dock & size ----

  function setTW(v) {
    tw = clamp(v, MIN_T, MAX_T);
    document.documentElement.style.setProperty("--tw", tw.toFixed(0));
  }

  function setRW(v) {
    rw = clamp(v, MIN_W, MAX_W);
    document.documentElement.style.setProperty("--rw", rw.toFixed(0));
  }

  function updateDock() {
    var read = mode === "read";
    fsBtn.classList.toggle("hidden", !read);
    backBtn.classList.toggle("hidden", !read);
    prevBtn.classList.toggle("hidden", !read);
    nextBtn.classList.toggle("hidden", !read);
    document.getElementById("focusBtn").classList.toggle("hidden", !read);
    if (read) {
      slider.min = String(MIN_W); slider.max = String(MAX_W);
      slider.step = String(STEP_W); slider.value = String(Math.round(rw));
      pct.textContent = Math.round(rw) + "%";
    } else {
      slider.min = String(MIN_T); slider.max = String(MAX_T);
      slider.step = String(STEP_T); slider.value = String(Math.round(tw));
      pct.textContent = Math.round(tw) + "%";
    }
  }

  function sliderInput() {
    if (mode === "read") setRW(Number(slider.value));
    else setTW(Number(slider.value));
    if (mode === "read") pct.textContent = Math.round(rw) + "%";
    else pct.textContent = Math.round(tw) + "%";
  }

  function showDock() { dock.classList.toggle("show", near || sliding); }

  // ---- events ----

  searchEl.addEventListener("input", applyFilter);
  document.getElementById("exit").addEventListener("click", function () { window.close(); });
  backBtn.addEventListener("click", backToBrowse);
  fsBtn.addEventListener("click", toggleFullscreen);
  prevBtn.addEventListener("click", function () { gotoComic(-1); });
  nextBtn.addEventListener("click", function () { gotoComic(1); });
  document.getElementById("focusBtn").addEventListener("click", enterFocus);
  document.getElementById("helpBtn").addEventListener("click", toggleHelp);
  document.getElementById("helpClose").addEventListener("click", function () { showHelp(false); });
  focusEl.addEventListener("click", function () { focusNav(1); });
  document.addEventListener("fullscreenchange", updateFs);
  document.addEventListener("webkitfullscreenchange", updateFs);

  slider.addEventListener("input", sliderInput);
  slider.addEventListener("pointerdown", function () { sliding = true; showDock(); });
  window.addEventListener("pointerup", function () { sliding = false; showDock(); });
  window.addEventListener("pointercancel", function () { sliding = false; showDock(); });

  document.addEventListener("mousemove", function (event) {
    near = event.clientY >= window.innerHeight - EDGE;
    showDock();
  }, { passive: true });
  document.addEventListener("mouseleave", function () { near = false; showDock(); });

  window.addEventListener("wheel", function (event) {
    if (focus || !event.ctrlKey) return;
    event.preventDefault();
    var dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 16;
    else if (event.deltaMode === 2) dy *= window.innerHeight;
    if (mode === "read") setRW(rw - dy / 50);
    else setTW(tw - dy / 20);
    updateDock();
  }, { passive: false, capture: true });

  readerEl.addEventListener("wheel", function (event) {
    if (event.ctrlKey || event.deltaY <= 0) return;
    if (wheelAdvancePending) return;
    wheelAdvancePending = true;
    requestAnimationFrame(function () {
      wheelAdvancePending = false;
      if (atBottom()) gotoComic(1);
    });
  }, { passive: true });

  readerEl.addEventListener("scroll", scheduleReaderPos, { passive: true });
  window.addEventListener("resize", function () { if (mode === "read") scheduleReaderPos(); });

  readerEl.addEventListener("click", function (event) {
    if (event.button !== 0) return;
    var imgs = readerEl.querySelectorAll("img");
    var st = readerEl.scrollTop;
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].offsetTop > st + 1) {
        readerEl.scrollTo(0, imgs[i].offsetTop);
        return;
      }
    }
  });

  gridEl.addEventListener("dblclick", function (event) {
    if (!cur || !cur.imgs.length) return;
    var t = event.target;
    var idx = 0;
    if (t && t.tagName === "IMG" && t.hasAttribute("data-index")) {
      idx = Number(t.getAttribute("data-index"));
    }
    openReader(idx);
  });

  document.addEventListener("keydown", function (event) {
    if (focus) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (helpEl.classList.contains("show")) showHelp(false);
        else exitFocus();
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault(); exitFocus();
      } else if (event.key === "j" || event.key === "J" || event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === " ") {
        event.preventDefault(); focusNav(1);
      } else if (event.key === "k" || event.key === "K" || event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "Backspace") {
        event.preventDefault(); focusNav(-1);
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault(); toggleFullscreen();
      } else if (event.key === "h" || event.key === "H" || event.key === "?") {
        event.preventDefault(); toggleHelp();
      } else if (event.key === "q" || event.key === "Q") {
        event.preventDefault(); window.close();
      }
      return;
    }

    if (document.activeElement === searchEl) {
      if (event.key === "Escape") { searchEl.value = ""; searchEl.blur(); applyFilter(); }
      else if (event.key === "Enter") { searchEl.blur(); }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      if (event.key === "=" || event.key === "-" || event.key === "+" || event.key === "0") event.preventDefault();
      return;
    }

    if (mode === "read") {
      if (event.key === "j" || event.key === "J" || event.key === "k" || event.key === "K") {
        event.preventDefault();
        var down = event.key === "j" || event.key === "J";
        if (down) heldJ = true; else heldK = true;
        if (!event.repeat) scrollLeft += (down ? 1 : -1) * window.innerHeight * 0.16;
        if (!scrollRaf) scrollRaf = requestAnimationFrame(scrollTick);
      } else if (event.key === "[") { event.preventDefault(); setRW(rw - STEP_W); updateDock(); }
      else if (event.key === "]") { event.preventDefault(); setRW(rw + STEP_W); updateDock(); }
      else if (event.key === "0") { event.preventDefault(); setRW(RESET_W); updateDock(); }
      else if (event.key === "1") { event.preventDefault(); setRW(100); updateDock(); }
      else if (event.key === "2") { event.preventDefault(); setRW(80); updateDock(); }
      else if (event.key === "3") { event.preventDefault(); setRW(50); updateDock(); }
      else if (event.key === "ArrowRight" || event.key === "n" || event.key === "N") { event.preventDefault(); gotoComic(1); }
      else if (event.key === "ArrowLeft" || event.key === "p" || event.key === "P") { event.preventDefault(); gotoComic(-1); }
      else if (event.key === "m" || event.key === "M") { event.preventDefault(); enterFocus(); }
      else if (event.key === "f" || event.key === "F") { event.preventDefault(); toggleFullscreen(); }
      else if (event.key === "h" || event.key === "H" || event.key === "?") { event.preventDefault(); toggleHelp(); }
      else if (event.key === "q" || event.key === "Q" || event.key === "Backspace") { event.preventDefault(); backToBrowse(); }
      else if (event.key === "Escape") {
        if (helpEl.classList.contains("show")) { event.preventDefault(); showHelp(false); }
        else if (fullscreenActive()) {
          event.preventDefault();
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      }
      return;
    }

    if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); select(sel + 1); }
    else if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); select(sel - 1); }
    else if (event.key === "n" || event.key === "N") { event.preventDefault(); heldN = true; if (!galleryRaf) galleryRaf = requestAnimationFrame(galleryTick); }
    else if (event.key === "u" || event.key === "U") { event.preventDefault(); heldU = true; if (!galleryRaf) galleryRaf = requestAnimationFrame(galleryTick); }
    else if (event.key === "g") { event.preventDefault(); select(0); }
    else if (event.key === "G") { event.preventDefault(); select(visible.length - 1); }
    else if (event.key === "/") { event.preventDefault(); searchEl.focus(); }
    else if (event.key === "Enter") { event.preventDefault(); openReader(); }
    else if (event.key === "h" || event.key === "H" || event.key === "?") { event.preventDefault(); toggleHelp(); }
    else if (event.key === "q" || event.key === "Q") { event.preventDefault(); window.close(); }
    else if (event.key === "[") { event.preventDefault(); setTW(tw - STEP_T); updateDock(); }
    else if (event.key === "]") { event.preventDefault(); setTW(tw + STEP_T); updateDock(); }
    else if (event.key === "0") { event.preventDefault(); setTW(RESET_T); updateDock(); }
  });

  window.addEventListener("keyup", function (event) {
    if (event.key === "j" || event.key === "J") heldJ = false;
    else if (event.key === "k" || event.key === "K") heldK = false;
    else if (event.key === "n" || event.key === "N") heldN = false;
    else if (event.key === "u" || event.key === "U") heldU = false;
  });
  window.addEventListener("blur", function () { heldJ = false; heldK = false; heldN = false; heldU = false; });

  setTW(RESET_T);
  setRW(RESET_W);
  updateDock();
  posEl.textContent = "loading…";

  if (window.flip) {
    window.flip.onComic(function (c) {
      COMICS.push(c);
      posEl.textContent = "loading… " + COMICS.length;
    });
    window.flip.onDone(function (opts) {
      if (opts.error) { posEl.textContent = opts.error; return; }
      AUTO_READ = !!opts.autoRead;
      if (AUTO_READ && COMICS.length === 1) {
        visible = COMICS;
        sel = 0;
        renderList();
        showComic();
        openReader(0);
      } else {
        applyFilter();
      }
    });
    window.flip.ready();
  }
})();
