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
var flashEl = document.getElementById("flash");
var jumpEl = document.getElementById("jump");
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
  var wpmControl = document.getElementById("wpmControl");
  var wpmSlider = document.getElementById("wpmSlider");
  var wpmValue = document.getElementById("wpmValue");
var metaEl = document.getElementById("meta");
var metaTitleEl = document.getElementById("metaTitle");
var metaAuthorEl = document.getElementById("metaAuthor");
var metaUrlEl = document.getElementById("metaUrl");
var metaChipsEl = document.getElementById("metaChips");
var metaTagInputEl = document.getElementById("metaTagInput");
var metaAuthorListEl = document.getElementById("metaAuthorList");
var metaTagListEl = document.getElementById("metaTagList");
var metaSaveBtn = document.getElementById("metaSave");
var metaCancelBtn = document.getElementById("metaCancel");

  var sel = -1, visible = [], mode = "browse";
  var cur = null;
  var tw = RESET_T, rw = RESET_W;
  var ioGrid = null, ioReader = null, loadTimer = 0;
  var heldJ = false, heldK = false, scrollLeft = 0, scrollRaf = 0;
  var heldN = false, heldU = false, galleryRaf = 0;
  var posRaf = 0;
  var browsePosRaf = 0;
  var flashMs = 1500;
  var flashTimer = 0;
  var near = false, sliding = false;
  var current = 0;
  var focus = false;
  var lastRead = {};
  var wheelAdvancePending = false;
  var gPending = false, gTimer = 0;
  var overscroll = 0;
  var sortMode = "natural";
  var sortDesc = false;
  var starFilter = false;
  var starReturnDir = null;
  var metaComic = null;
  var metaTags = [];
  var metaAllTags = [];
  var metaAllAuthors = [];

  // slideshow
  var SLIDESHOW = false;
  var wpm = 200;
  var MIN_WPM = 60, MAX_WPM = 800;
  var SLIDESHOW_BASE = 4.5, SLIDESHOW_MIN = 4.0, SLIDESHOW_MAX = 45;
  var slideshowTimer = 0;
  var slideshowActive = false;
  var wordCounts = {}; // pageIndex -> word count for current comic

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function saveLastRead() {
    if (window.flip && window.flip.saveState) window.flip.saveState(lastRead);
  }

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

  function sortComics() {
    var key = sortMode;
    var desc = sortDesc;
    COMICS.sort(function (a, b) {
      var r = 0;
      if (key === "title") {
        r = (a.title || "").localeCompare(b.title || "", undefined, { numeric: true, sensitivity: "base" });
      } else if (key === "author") {
        r = (a.author || "").localeCompare(b.author || "", undefined, { sensitivity: "base" });
        if (r === 0) r = (a.title || "").localeCompare(b.title || "", undefined, { numeric: true, sensitivity: "base" });
      } else if (key === "date") {
        r = (a.date || 0) - (b.date || 0);
      } else {
        r = (a.id || 0) - (b.id || 0);
      }
      return desc ? -r : r;
    });
  }

  function cycleSort() {
    var modes = ["natural", "title", "author", "date"];
    sortMode = modes[(modes.indexOf(sortMode) + 1) % modes.length];
    sortComics();
    applyFilter();
  }

  function toggleSortDir() {
    sortDesc = !sortDesc;
    sortComics();
    applyFilter();
  }

  function applyFilter(preserveDir) {
    var q = searchEl.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    visible = COMICS.filter(function (c) {
      if (starFilter && !c.starred) return false;
      var hay = (c.title + " " + c.author + " " + c.tags.join(" ")).toLowerCase();
      return q.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    var idx = 0;
    if (preserveDir) {
      for (var i = 0; i < visible.length; i++) {
        if (visible[i].dir === preserveDir) { idx = i; break; }
      }
    }
    sel = visible.length ? idx : -1;
    renderList();
    select(sel, true);
  }

  function renderList() {
    listEl.innerHTML = "";
    visible.forEach(function (c, i) {
      var row = document.createElement("div");
      row.className = "row" + (i === sel ? " sel" : "");
      var t = document.createElement("div"); t.className = "t";
      if (c.starred) {
        var star = document.createElement("span");
        star.className = "star";
        star.textContent = "★ ";
        t.appendChild(star);
      }
      t.appendChild(document.createTextNode(c.title));
      var a = document.createElement("div"); a.className = "a"; a.textContent = c.author;
      row.appendChild(t); row.appendChild(a);
      row.addEventListener("click", function () { select(i); });
      row.addEventListener("dblclick", function () { openMeta(c); });
      listEl.appendChild(row);
    });
  }

  function gridScrollPct() {
    var max = rightEl.scrollHeight - rightEl.clientHeight;
    if (max <= 0) return 100;
    return Math.round((rightEl.scrollTop / max) * 100);
  }

  function browsePos() {
    var c = visible[sel];
    if (!c) { posEl.textContent = "0/0"; return; }
    var s = (sel + 1) + "/" + visible.length + " — " + c.title;
    if (c.imgs.length) s += " · " + c.imgs.length + " pages";
    s += " · " + gridScrollPct() + "%";
    s += " [" + sortMode + (sortDesc ? " desc" : " asc") + "]";
    if (starFilter) s += " [starred]";
    posEl.textContent = s;
  }

  function scheduleBrowsePos() {
    if (browsePosRaf) return;
    browsePosRaf = requestAnimationFrame(function () {
      browsePosRaf = 0;
      browsePos();
    });
  }

  function flashTitle(title) {
    if (flashMs <= 0) return;
    flashEl.textContent = title || "";
    flashEl.classList.add("show");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashEl.classList.remove("show"); }, flashMs);
  }

  function clearLastRead() {
    if (!cur || !cur.dir) return;
    delete lastRead[cur.dir];
    saveLastRead();
    highlightLastRead();
    scrollGridTop();
  }

  function toggleStar() {
    if (!cur) return;
    cur.starred = !cur.starred;
    if (window.flip && window.flip.star) {
      window.flip.star({ dir: cur.dir, starred: cur.starred });
    }
    applyFilter(cur.dir);
  }

  function toggleStarFilter() {
    starFilter = !starFilter;
    if (starFilter) {
      starReturnDir = cur ? cur.dir : null;
      applyFilter(cur && cur.starred ? cur.dir : null);
    } else {
      applyFilter(starReturnDir);
      starReturnDir = null;
    }
  }

  function select(i, force) {
    if (i < 0 || i >= visible.length) return;
    if (sel === i && !force) return;
    sel = i;
    cur = visible[sel];
    flashTitle(cur.title);
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
      var thumb = document.createElement("div");
      thumb.className = "thumb" + (i === lastRead[c.dir] ? " last" : "");
      var img = document.createElement("img");
      img.setAttribute("data-src", fileURL(c.dir, rel));
      img.setAttribute("data-index", String(i));
      img.className = "pending";
      thumb.appendChild(img);
      gridEl.appendChild(thumb);
    });
    observeGrid();
    highlightLastRead();
  }

  function normalizeTag(raw) {
    return String(raw || "").toLowerCase().replace(/\+/g, " ").replace(/%20/gi, " ").replace(/\s+/g, " ").trim();
  }

  function renderMetaChips() {
    metaChipsEl.textContent = "";
    metaTags.forEach(function (tag, i) {
      var chip = document.createElement("span");
      chip.className = "meta-chip";
      var label = document.createElement("span");
      label.textContent = tag;
      var x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.title = "Remove " + tag;
      x.addEventListener("click", function () { metaTags.splice(i, 1); renderMetaChips(); });
      chip.appendChild(label);
      chip.appendChild(x);
      metaChipsEl.appendChild(chip);
    });
  }

  function addMetaTag(raw) {
    var norm = normalizeTag(raw);
    if (!norm || metaTags.indexOf(norm) !== -1) return;
    metaTags.push(norm);
    renderMetaChips();
  }

  function fillMetaSuggestions() {
    var authors = {}, tags = {};
    COMICS.forEach(function (c) {
      if (c.author) authors[c.author] = true;
      (c.tags || []).forEach(function (t) { if (t) tags[t] = true; });
    });
    metaAllAuthors = Object.keys(authors).sort();
    metaAllTags = Object.keys(tags).sort();
    metaAuthorListEl.textContent = "";
    metaAllAuthors.forEach(function (a) {
      var o = document.createElement("option"); o.value = a; metaAuthorListEl.appendChild(o);
    });
    metaTagListEl.textContent = "";
    metaAllTags.forEach(function (t) {
      var o = document.createElement("option"); o.value = t; metaTagListEl.appendChild(o);
    });
  }

  function metaTagSuggestion(raw) {
    var norm = normalizeTag(raw);
    if (!norm) return null;
    var matches = metaAllTags.filter(function (t) { return t.indexOf(norm) === 0 && t !== norm; });
    return matches.length === 1 ? matches[0] : null;
  }

  function openMeta(c) {
    metaComic = c;
    metaTitleEl.value = c.title || "";
    metaAuthorEl.value = c.author || "";
    metaUrlEl.value = c.url || "";
    metaTags = (c.tags || []).slice();
    renderMetaChips();
    fillMetaSuggestions();
    metaEl.classList.add("show");
    metaTitleEl.focus();
  }

  function closeMeta() {
    metaEl.classList.remove("show");
    metaComic = null;
  }

  function saveMeta() {
    if (!metaComic) return;
    var title = metaTitleEl.value.trim();
    var author = metaAuthorEl.value.trim();
    var url = metaUrlEl.value.trim();
    var tags = metaTags.slice();
    var base = metaComic.dir.split("/").pop();
    metaComic.title = title || base;
    metaComic.author = author;
    metaComic.url = url;
    metaComic.tags = tags;
    if (window.flip && window.flip.saveMeta) {
      window.flip.saveMeta({ dir: metaComic.dir, title: title, author: author, url: url, tags: tags });
    }
    closeMeta();
    renderList();
    browsePos();
  }

  // ---- read ----

  function openReader(startIndex) {
    var c = cur;
    if (!c || !c.imgs.length) return;
    if (typeof startIndex !== "number") {
      var remembered = lastRead[c.dir];
      startIndex = (typeof remembered === "number" && remembered >= 0 && remembered < c.imgs.length) ? remembered : 0;
    }
    mode = "read";
    document.body.classList.add("read");
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
    for (var i = 0; i <= index; i++) activate(imgs[i]);
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

  function gotoComic(delta, toEnd) {
    if (mode !== "read") return false;
    var target = sel + delta;
    if (target < 0 || target >= visible.length) return false;
    if (cur && cur.dir) { lastRead[cur.dir] = current; saveLastRead(); }
    sel = target;
    cur = visible[sel];
    var rows = listEl.children;
    for (var k = 0; k < rows.length; k++) rows[k].classList.toggle("sel", k === sel);
    if (rows[sel]) rows[sel].scrollIntoView({ block: "nearest" });
    renderReader(toEnd ? cur.imgs.length - 1 : 0);
    updateDock();
    scheduleReaderPos();
    return true;
  }

  function backToBrowse() {
    lastRead[cur.dir] = current;
    saveLastRead();
    mode = "browse";
    document.body.classList.remove("read");
    readerEl.style.display = "none";
    browseEl.style.display = "flex";
    updateDock();
    highlightLastRead();
    browsePos();
  }

  function highlightLastRead() {
    var last = lastRead[cur.dir];
    var thumbs = gridEl.querySelectorAll(".thumb");
    for (var i = 0; i < thumbs.length; i++) {
      var idx = thumbs[i].querySelector("img");
      thumbs[i].classList.toggle("last", !!idx && Number(idx.getAttribute("data-index")) === last);
    }
    if (typeof last === "number") {
      var t = gridEl.querySelector('.thumb img[data-index="' + last + '"]');
      if (t) t.scrollIntoView({ block: "center" });
    }
  }

  function scrollGridTop() { rightEl.scrollTop = 0; }
  function scrollGridBottom() { rightEl.scrollTop = rightEl.scrollHeight; }
  function pageDown() { readerEl.scrollTop += readerEl.clientHeight; }

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

  function atTop() {
    return readerEl.scrollTop <= 0;
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

    var info = (current + 1) + " / " + cur.imgs.length + " — " + name;
    var words = wordCounts[current] || 0;
    if (words > 0 || SLIDESHOW) {
      var dur = getDuration(words);
      info += " · " + words + " words · " + dur.toFixed(1) + "s";
    }
    focusCaption.textContent = info;

    // prefetch next
    if (current + 1 < cur.imgs.length && !wordCounts[current + 1]) {
      prefetchWordCount(current + 1);
    }
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
    if (SLIDESHOW && typeof wordCounts[current] === "undefined") {
      prefetchWordCount(current);
    }
    showWpmControl();
  }

  function exitFocus() {
    if (!focus) return;
    stopSlideshow();
    focus = false;
    focusEl.classList.remove("show");
    document.body.classList.remove("focus");
    showWpmControl();
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
    if (slideshowActive) {
      scheduleNextSlide();
    }
  }

  function showJump() {
    jumpEl.value = "";
    jumpEl.classList.add("show");
    jumpEl.focus();
  }

  function hideJump() {
    jumpEl.classList.remove("show");
  }

  function jumpToPage(n) {
    if (!cur || !cur.imgs.length) return;
    var idx = clamp(n - 1, 0, cur.imgs.length - 1);
    if (focus) {
      current = idx;
      focusUpdate();
    } else {
      current = idx;
      scrollToImage(idx);
    }
  }

  function commitJump() {
    var n = parseInt(jumpEl.value.trim(), 10);
    hideJump();
    if (isNaN(n) || n < 1) return;
    jumpToPage(n);
  }

  // ---- slideshow (text-based timing in focus mode) ----
  function getDuration(words) {
    if (words < 8) return 5.0;                    // minimum for artwork appreciation
    var seconds = SLIDESHOW_BASE + (words / wpm) * 60;
    return clamp(seconds, SLIDESHOW_MIN, SLIDESHOW_MAX);
  }

  async function prefetchWordCount(idx) {
    if (!cur || !cur.dir || !cur.imgs[idx]) return;
    var fullPath = fileURL(cur.dir, cur.imgs[idx]).replace(/^file:\/\//, "");
    try {
      var words = await window.flip.ocrWords(fullPath);
      wordCounts[idx] = words;
      if (idx === current) focusUpdate();
    } catch (e) {
      wordCounts[idx] = 0;
    }
  }

  function startSlideshow() {
    if (!focus || !cur) return;
    slideshowActive = true;
    if (wpmControl) {
      wpmControl.classList.add("show");           // show immediately when starting
      setTimeout(showWpmControl, 3500);           // then follow mouse hover rule
    }
    scheduleNextSlide();
  }

  function stopSlideshow() {
    if (slideshowTimer) {
      clearTimeout(slideshowTimer);
      slideshowTimer = 0;
    }
    slideshowActive = false;
    showWpmControl();
  }

  function scheduleNextSlide() {
    if (slideshowTimer) clearTimeout(slideshowTimer);
    var words = wordCounts[current] || 0;
    var durMs = getDuration(words) * 1000;
    slideshowTimer = setTimeout(advanceSlide, Math.max(800, durMs));
  }

  function advanceSlide() {
    focusNav(1);
    if (focus && slideshowActive) {
      setTimeout(scheduleNextSlide, 150);
    }
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

  function showWpmControl() {
    if (wpmControl) {
      var shouldShow = focus && (near || sliding);
      wpmControl.classList.toggle("show", shouldShow);
    }
  }

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
  metaSaveBtn.addEventListener("click", saveMeta);
  metaCancelBtn.addEventListener("click", closeMeta);
  jumpEl.addEventListener("blur", function () { jumpEl.classList.remove("show"); });
  metaTitleEl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); saveMeta(); } });
  metaAuthorEl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); saveMeta(); } });
  metaUrlEl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); saveMeta(); } });
  metaTagInputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      e.stopPropagation();
      var sug = metaTagSuggestion(metaTagInputEl.value);
      addMetaTag(sug || metaTagInputEl.value);
      metaTagInputEl.value = "";
    } else if (e.key === "Backspace" && metaTagInputEl.value === "") {
      if (metaTags.length) { metaTags.pop(); renderMetaChips(); }
    }
  });
  focusEl.addEventListener("click", function () { focusNav(1); });
  document.addEventListener("fullscreenchange", updateFs);
  document.addEventListener("webkitfullscreenchange", updateFs);

  slider.addEventListener("input", sliderInput);
  slider.addEventListener("pointerdown", function () { sliding = true; showDock(); });
  window.addEventListener("pointerup", function () { sliding = false; showDock(); });
  window.addEventListener("pointercancel", function () { sliding = false; showDock(); });

  // wpm slider for slideshow
  if (wpmSlider) {
    wpmSlider.addEventListener("input", function () {
      wpm = clamp(Number(this.value), MIN_WPM, MAX_WPM);
      wpmValue.textContent = Math.round(wpm);
      if (slideshowActive) scheduleNextSlide();
    });
    wpmSlider.addEventListener("pointerdown", function () { sliding = true; showWpmControl(); });
  }

  document.addEventListener("mousemove", function (event) {
    near = event.clientY >= window.innerHeight - EDGE;
    showDock();
    showWpmControl();
  }, { passive: true });
  document.addEventListener("mouseleave", function () { near = false; showDock(); showWpmControl(); });

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
    if (event.ctrlKey) return;
    var dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 16;
    else if (event.deltaMode === 2) dy *= window.innerHeight;
    if (dy > 0 && atBottom()) {
      overscroll += dy;
      if (overscroll >= 200) { overscroll = 0; gotoComic(1); }
    } else if (dy < 0 && atTop()) {
      overscroll -= dy;
      if (overscroll >= 200) { overscroll = 0; gotoComic(-1, true); }
    } else {
      overscroll = 0;
    }
  }, { passive: true });

  readerEl.addEventListener("scroll", scheduleReaderPos, { passive: true });
  rightEl.addEventListener("scroll", scheduleBrowsePos, { passive: true });
  window.addEventListener("resize", function () { if (mode === "read") scheduleReaderPos(); });

  readerEl.addEventListener("click", function (event) {
    if (event.button !== 0) return;
    pageDown();
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
    if (metaEl.classList.contains("show")) {
      if (event.key === "Escape") { event.preventDefault(); closeMeta(); }
      return;
    }
    if (jumpEl.classList.contains("show")) {
      if (event.key === "Enter") { event.preventDefault(); commitJump(); }
      else if (event.key === "Escape") { event.preventDefault(); hideJump(); }
      return;
    }
    if (focus) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (helpEl.classList.contains("show")) showHelp(false);
        else exitFocus();
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault(); exitFocus();
      } else if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        if (slideshowActive) {
          stopSlideshow();
        } else {
          startSlideshow();
        }
      } else if (event.key === "j" || event.key === "J" || event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === " ") {
        event.preventDefault(); focusNav(1);
      } else if (event.key === "k" || event.key === "K" || event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault(); focusNav(-1);
      } else if (event.key === "Backspace") {
        event.preventDefault(); exitFocus(); backToBrowse();
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault(); toggleFullscreen();
      } else if (event.key === ":") {
        event.preventDefault(); showJump();
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
      else if (event.key === " ") { event.preventDefault(); pageDown(); }
      else if (event.key === "ArrowRight" || event.key === "n" || event.key === "N") { event.preventDefault(); gotoComic(1); }
      else if (event.key === "ArrowLeft" || event.key === "p" || event.key === "P") { event.preventDefault(); gotoComic(-1); }
      else if (event.key === "m" || event.key === "M") { event.preventDefault(); enterFocus(); }
      else if (event.key === "f" || event.key === "F") { event.preventDefault(); toggleFullscreen(); }
      else if (event.key === ":") { event.preventDefault(); showJump(); }
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

    if (gPending) {
      gPending = false;
      clearTimeout(gTimer);
      if (event.key === "g") { event.preventDefault(); scrollGridTop(); return; }
      if (event.key === "l") { event.preventDefault(); highlightLastRead(); return; }
    }

    if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); select(sel + 1); }
    else if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); select(sel - 1); }
    else if (event.key === "n" || event.key === "N") { event.preventDefault(); heldN = true; if (!galleryRaf) galleryRaf = requestAnimationFrame(galleryTick); }
    else if (event.key === "u" || event.key === "U") { event.preventDefault(); heldU = true; if (!galleryRaf) galleryRaf = requestAnimationFrame(galleryTick); }
    else if (event.key === "g") { event.preventDefault(); gPending = true; gTimer = setTimeout(function () { gPending = false; }, 800); }
    else if (event.key === "G") { event.preventDefault(); scrollGridBottom(); }
    else if (event.key === "/") { event.preventDefault(); searchEl.focus(); }
    else if (event.key === "s") {
      event.preventDefault();
      if (cur) {
        // Start slideshow from last read position (or beginning)
        var startIdx = (typeof lastRead[cur.dir] === "number") ? lastRead[cur.dir] : 0;
        openReader(startIdx);
        setTimeout(() => {
          enterFocus();
          startSlideshow();
        }, 100);
      } else {
        cycleSort();
      }
    }
    else if (event.key === "S") { event.preventDefault(); toggleSortDir(); }
    else if (event.key === "e") { event.preventDefault(); if (cur) openMeta(cur); }
    else if (event.key === "x") { event.preventDefault(); clearLastRead(); }
    else if (event.key === "r") { event.preventDefault(); toggleStar(); }
    else if (event.key === "R") { event.preventDefault(); toggleStarFilter(); }
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
  window.addEventListener("beforeunload", function () {
    if (cur && cur.dir) { lastRead[cur.dir] = current; saveLastRead(); }
  });

  setTW(RESET_T);
  setRW(RESET_W);
  if (wpmSlider) {
    wpmSlider.value = wpm;
    wpmValue.textContent = Math.round(wpm);
  }
  updateDock();
  showWpmControl();
  posEl.textContent = "loading…";

  if (window.flip) {
    window.flip.onComic(function (c) {
      COMICS.push(c);
      posEl.textContent = "loading… " + COMICS.length;
    });
    window.flip.onDone(function (opts) {
      if (opts.error) { posEl.textContent = opts.error; return; }
      AUTO_READ = !!opts.autoRead;
      SLIDESHOW = !!opts.slideshow;
      lastRead = opts.state || {};
      if (typeof opts.titleFlash === "number") flashMs = opts.titleFlash;
      if (AUTO_READ && COMICS.length === 1) {
        visible = COMICS;
        sel = 0;
        renderList();
        showComic();
        openReader(0);
        if (SLIDESHOW) {
          setTimeout(() => {
            enterFocus();
            startSlideshow();
          }, 800);
        }
      } else {
        applyFilter();
      }
    });
    window.flip.ready();
  }
})();
