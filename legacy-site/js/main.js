/* ═══════════════════════════════════════════════════════════
   LIBAAS COUTURE STUDIO — interactions & animations
   Vanilla JS · no libraries
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ── PRELOADER ─────────────────────────────────────────── */
  const preloader = document.getElementById('preloader');
  const MIN_PRELOAD = prefersReduced ? 0 : 1600;
  const startedAt = performance.now();

  function finishPreload() {
    const wait = Math.max(0, MIN_PRELOAD - (performance.now() - startedAt));
    setTimeout(() => {
      preloader.classList.add('is-done');
      document.body.classList.add('loaded');
      setTimeout(() => preloader.remove(), 1200);
    }, wait);
  }
  if (document.readyState === 'complete') finishPreload();
  else window.addEventListener('load', finishPreload);
  // safety: never trap the user behind the loader
  setTimeout(() => {
    if (!document.body.classList.contains('loaded')) finishPreload();
  }, 4000);

  /* ── HERO TITLE — split words for staggered reveal ─────── */
  const heroTitle = document.getElementById('heroTitle');
  if (heroTitle && !prefersReduced) {
    const parts = [];
    heroTitle.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/\s+/).filter(Boolean).forEach((w) => parts.push({ text: w, em: false }));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        node.textContent.split(/\s+/).filter(Boolean).forEach((w) => parts.push({ text: w, em: true }));
      }
    });
    heroTitle.innerHTML = parts
      .map((p, i) => {
        const inner = `<span class="w-inner" style="--wd:${200 + i * 90}ms">${p.text}</span>`;
        return `<span class="w">${p.em ? '<em>' + inner + '</em>' : inner}</span>`;
      })
      .join(' ');
  }

  /* ── IMAGE FALLBACKS (graceful placeholders) ───────────── */
  document.querySelectorAll('.img-frame img, .look img').forEach((img) => {
    img.addEventListener('error', () => {
      const frame = img.closest('.img-frame, .look');
      if (frame) frame.classList.add('img-failed');
    });
    if (img.complete && img.naturalWidth === 0 && img.src) {
      const frame = img.closest('.img-frame, .look');
      if (frame) frame.classList.add('img-failed');
    }
  });

  /* ── HEADER + PROGRESS + TO-TOP on scroll ──────────────── */
  const header = document.getElementById('siteHeader');
  const progressBar = document.getElementById('progressBar');
  const toTop = document.getElementById('toTop');

  function onScroll() {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 40);
    toTop.classList.toggle('is-visible', y > 650);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' }));

  /* ── MOBILE NAV ────────────────────────────────────────── */
  const navToggle = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));

  navLinks.forEach((l, i) => l.style.setProperty('--nd', i));

  function setNav(open) {
    siteNav.classList.toggle('is-open', open);
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  navToggle.addEventListener('click', () => setNav(!siteNav.classList.contains('is-open')));
  siteNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setNav(false)));

  /* ── ACTIVE NAV LINK (scroll spy) ──────────────────────── */
  const sections = Array.from(document.querySelectorAll('main section[id]'));
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        navLinks.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === '#' + id));
      });
    },
    { rootMargin: '-40% 0px -55% 0px' }
  );
  sections.forEach((s) => spy.observe(s));

  /* ── REVEAL ON SCROLL ──────────────────────────────────── */
  document.querySelectorAll('[data-reveal][data-delay]').forEach((el) => {
    el.style.setProperty('--rd', el.dataset.delay + 'ms');
  });
  document.querySelectorAll('[data-stagger]').forEach((group) => {
    Array.from(group.children).forEach((child, i) => child.style.setProperty('--sd', i * 110 + 'ms'));
  });

  const revealer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          revealer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('[data-reveal], [data-stagger]').forEach((el) => revealer.observe(el));

  /* ── COUNTERS ──────────────────────────────────────────── */
  const counterObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        counterObs.unobserve(el);
        const target = parseInt(el.dataset.count, 10);
        if (prefersReduced) { el.textContent = target.toLocaleString('en-IN'); return; }
        const dur = 1800;
        const t0 = performance.now();
        (function tick(now) {
          const p = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased).toLocaleString('en-IN');
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll('[data-count]').forEach((el) => counterObs.observe(el));

  /* ── PARALLAX ──────────────────────────────────────────── */
  const parallaxEls = Array.from(document.querySelectorAll('[data-parallax]'));
  if (parallaxEls.length && !prefersReduced && finePointer) {
    let ticking = false;
    function parallax() {
      const vh = window.innerHeight;
      parallaxEls.forEach((el) => {
        const speed = parseFloat(el.dataset.parallax) || 0.1;
        const rect = el.getBoundingClientRect();
        const offset = (rect.top + rect.height / 2 - vh / 2) * speed;
        el.style.translate = '0 ' + (-offset).toFixed(1) + 'px';
      });
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(parallax); ticking = true; }
    }, { passive: true });
    parallax();
  }

  /* ── TILT CARDS ────────────────────────────────────────── */
  if (finePointer && !prefersReduced) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      let raf = null;
      el.addEventListener('mousemove', (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const rx = ((e.clientY - r.top) / r.height - 0.5) * -9;
          const ry = ((e.clientX - r.left) / r.width - 0.5) * 9;
          el.style.transform = `perspective(700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(1.02)`;
          raf = null;
        });
      });
      el.addEventListener('mouseleave', () => {
        el.style.transition = 'transform 0.6s cubic-bezier(0.22,1,0.36,1)';
        el.style.transform = '';
        setTimeout(() => (el.style.transition = ''), 600);
      });
    });
  }

  /* ── MAGNETIC BUTTONS ──────────────────────────────────── */
  if (finePointer && !prefersReduced) {
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - r.left - r.width / 2) * 0.22;
        const dy = (e.clientY - r.top - r.height / 2) * 0.32;
        el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* ── CUSTOM CURSOR ─────────────────────────────────────── */
  const dot = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  if (finePointer && !prefersReduced && dot && ring) {
    let mx = -100, my = -100, rx = -100, ry = -100;
    document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
    (function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      ring.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    })();

    const hoverables = 'a, button, .look, .card, [data-tilt]';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(hoverables)) ring.classList.add('is-hover');
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(hoverables)) ring.classList.remove('is-hover');
    });
  }

  /* ── COLLECTION FILTERS ────────────────────────────────── */
  const filterBtns = Array.from(document.querySelectorAll('.filter-btn'));
  const cards = Array.from(document.querySelectorAll('#collectionGrid .card'));

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      const f = btn.dataset.filter;
      cards.forEach((card, i) => {
        const show = f === 'all' || card.dataset.cat === f;
        card.classList.remove('card-in');
        if (show) {
          card.classList.remove('is-hidden');
          // ensure reveal state doesn't hide re-shown cards
          card.classList.add('is-revealed');
          void card.offsetWidth; // restart animation
          card.style.animationDelay = (i % 4) * 60 + 'ms';
          card.classList.add('card-in');
        } else {
          card.classList.add('is-hidden');
        }
      });
    });
  });

  /* ── TESTIMONIAL SLIDER ────────────────────────────────── */
  const tTrack = document.getElementById('tTrack');
  const tSlides = Array.from(tTrack.children);
  const tDots = document.getElementById('tDots');
  let tIndex = 0;
  let tTimer = null;

  tSlides.forEach((_, i) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 't-dot' + (i === 0 ? ' is-active' : '');
    d.setAttribute('aria-label', 'Review ' + (i + 1));
    d.addEventListener('click', () => goSlide(i, true));
    tDots.appendChild(d);
  });
  const dots = Array.from(tDots.children);

  function goSlide(i, manual) {
    tIndex = (i + tSlides.length) % tSlides.length;
    tTrack.style.transform = `translateX(-${tIndex * 100}%)`;
    dots.forEach((d, j) => d.classList.toggle('is-active', j === tIndex));
    if (manual) restartAuto();
  }
  function restartAuto() {
    if (tTimer) clearInterval(tTimer);
    if (!prefersReduced) tTimer = setInterval(() => goSlide(tIndex + 1, false), 5200);
  }
  restartAuto();

  document.getElementById('tPrev').addEventListener('click', () => goSlide(tIndex - 1, true));
  document.getElementById('tNext').addEventListener('click', () => goSlide(tIndex + 1, true));

  const slider = document.getElementById('tSlider');
  slider.addEventListener('mouseenter', () => tTimer && clearInterval(tTimer));
  slider.addEventListener('mouseleave', restartAuto);

  // touch swipe
  let touchX = null;
  slider.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  slider.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) goSlide(tIndex + (dx < 0 ? 1 : -1), true);
    touchX = null;
  }, { passive: true });

  /* ── LIGHTBOX ──────────────────────────────────────────── */
  const looks = Array.from(document.querySelectorAll('.look'));
  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lbImg');
  const lbCaption = document.getElementById('lbCaption');
  let lbIndex = 0;

  function openLb(i) {
    lbIndex = (i + looks.length) % looks.length;
    const look = looks[lbIndex];
    const img = look.querySelector('img');
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    lbCaption.textContent = look.dataset.caption || '';
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeLb() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  looks.forEach((look, i) => look.addEventListener('click', () => openLb(i)));
  document.getElementById('lbClose').addEventListener('click', closeLb);
  document.getElementById('lbPrev').addEventListener('click', () => openLb(lbIndex - 1));
  document.getElementById('lbNext').addEventListener('click', () => openLb(lbIndex + 1));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLb(); });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') openLb(lbIndex - 1);
    if (e.key === 'ArrowRight') openLb(lbIndex + 1);
  });

  /* ── BOOKING FORM ──────────────────────────────────────── */
  const form = document.getElementById('bookingForm');
  const success = document.getElementById('formSuccess');

  function validateField(field) {
    const wrap = field.closest('.field');
    let ok = true;
    if (field.required && !field.value.trim()) ok = false;
    if (ok && field.id === 'fPhone') {
      const digits = field.value.replace(/\D/g, '');
      ok = digits.length === 10 || (digits.length === 12 && digits.startsWith('91'));
    }
    wrap.classList.toggle('has-error', !ok);
    return ok;
  }

  form.querySelectorAll('input, select').forEach((f) => {
    f.addEventListener('input', () => f.closest('.field').classList.remove('has-error'));
    f.addEventListener('blur', () => { if (f.value) validateField(f); });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fields = Array.from(form.querySelectorAll('input[required], select[required], #fPhone'));
    const allOk = fields.map(validateField).every(Boolean);
    if (!allOk) {
      const firstBad = form.querySelector('.field.has-error input, .field.has-error select');
      if (firstBad) firstBad.focus();
      return;
    }
    // local demo — no data leaves this page
    success.classList.add('is-visible');
    form.reset();
  });

  document.getElementById('successClose').addEventListener('click', () => {
    success.classList.remove('is-visible');
  });

  /* ── FOOTER YEAR ───────────────────────────────────────── */
  document.getElementById('year').textContent = new Date().getFullYear();
})();
