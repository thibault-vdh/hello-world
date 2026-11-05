/* Noon Security: homepage interactions (no dependencies) */
(() => {
  'use strict';

  /* ---------------------------------------------------------------------
     Config
     Early-access form posts to HubSpot's Forms API (same portal + form as
     the live Webflow site). Set SUBMIT_TO_HUBSPOT to false while iterating
     locally so test submissions don't create real leads.
  --------------------------------------------------------------------- */
  const HUBSPOT = {
    SUBMIT_TO_HUBSPOT: false,
    region: 'eu1',
    portalId: '26076760',
    formId: 'e7928bfb-e83a-4b13-881b-3ab58f8229ed',
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- Mobile nav ---------- */
  const nav = $('[data-nav]');
  const toggle = $('[data-nav-toggle]');
  toggle?.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  });

  /* ---------- Products dropdown ---------- */
  const dd = $('[data-dropdown]');
  if (dd) {
    const btn = $('button', dd);
    const desktop = window.matchMedia('(min-width: 992px)');
    let closeTimer;
    const set = (open) => {
      dd.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => set(!dd.classList.contains('is-open')));
    dd.addEventListener('mouseenter', () => { if (desktop.matches) { clearTimeout(closeTimer); set(true); } });
    dd.addEventListener('mouseleave', () => { if (desktop.matches) closeTimer = setTimeout(() => set(false), 150); });
    document.addEventListener('click', (e) => { if (!dd.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dd.classList.contains('is-open')) { set(false); btn.focus(); } });

    const figs = $$('.dropdown__preview figure', dd);
    $$('[data-preview]', dd).forEach((a) => {
      const show = () => figs.forEach((f, i) => f.classList.toggle('is-active', i === +a.dataset.preview));
      a.addEventListener('mouseenter', show);
      a.addEventListener('focus', show);
    });
  }

  /* ---------- "Protect your team" tabs ---------- */
  const tabs = $('[data-tabs]');
  if (tabs) {
    const items = $$('[data-tab]', tabs);
    const panels = $$('[data-panel]', tabs);
    const select = (idx, focus) => {
      items.forEach((t, i) => {
        t.setAttribute('aria-selected', String(i === idx));
        t.tabIndex = i === idx ? 0 : -1;
      });
      panels.forEach((p, i) => p.classList.toggle('is-active', i === idx));
      if (focus) items[idx].focus();
    };
    items.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('mouseenter', () => { if (window.matchMedia('(hover: hover) and (min-width: 992px)').matches) select(i); });
      t.addEventListener('keydown', (e) => {
        const n = items.length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % n, true); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); select((i - 1 + n) % n, true); }
      });
    });
    select(0);
  }

  /* ---------- Sticky "How we protect you" menu: highlight current section ---------- */
  const howMenu = $('[data-how-menu]');
  if (howMenu && 'IntersectionObserver' in window) {
    const links = $$('a', howMenu);
    const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
    const setActive = (id) => links.forEach((a) => {
      const on = a.getAttribute('href') === `#${id}`;
      a.classList.toggle('is-active', on);
      // Keep the active pill visible when the menu scrolls sideways (mobile),
      // without touching the page's vertical scroll.
      if (on) howMenu.scrollTo({ left: a.offsetLeft - (howMenu.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
  }

  /* ---------- FAQ accordion ---------- */
  $$('[data-accordion] .accordion__trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.accordion__item');
      const open = !item.classList.contains('is-open');
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  /* ---------- Vimeo helpers ---------- */
  const vimeoIframe = (id, title) => {
    const f = document.createElement('iframe');
    f.src = `https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0&portrait=0&dnt=1`;
    f.allow = 'autoplay; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    f.title = title;
    return f;
  };

  /* Inline product video: swap the looping snippet for the full Vimeo video */
  const video = $('[data-video]');
  if (video) {
    $('.video__play', video).addEventListener('click', () => {
      const frame = $('.video__frame', video);
      $('video', frame)?.remove();
      frame.prepend(vimeoIframe(video.dataset.vimeoId, 'Noon product video'));
      video.classList.add('is-playing');
    }, { once: true });
  }

  /* Floating "Play Demo" + lightbox */
  const trigger = $('[data-demo-trigger]');
  const lightbox = $('[data-lightbox]');
  const lbFrame = $('[data-lightbox-frame]');
  let lastFocus = null;
  const openLightbox = () => {
    lastFocus = document.activeElement;
    lbFrame.replaceChildren(vimeoIframe(lightbox.dataset.vimeoId, 'Noon demo'));
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    $('[data-lightbox-close]').focus();
  };
  const closeLightbox = () => {
    lightbox.classList.remove('is-open');
    lbFrame.replaceChildren();
    document.body.style.overflow = '';
    lastFocus?.focus();
  };
  $('[data-lightbox-open]')?.addEventListener('click', openLightbox);
  $('[data-lightbox-close]')?.addEventListener('click', closeLightbox);
  lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lightbox?.classList.contains('is-open')) closeLightbox(); });
  $('[data-demo-close]')?.addEventListener('click', () => trigger.classList.add('is-hidden'));

  // Hide the floating trigger while the footer is in view so it never covers links.
  const footer = $('.footer');
  if (trigger && footer && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => trigger.classList.toggle('is-tucked', e.isIntersecting))
      .observe(footer);
  }

  /* ---------- Early-access forms ---------- */
  const getCookie = (name) => document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=')[1];

  $$('[data-signup]').forEach((form) => {
    const input = $('input[type="email"]', form);
    const msg = $('.signup__msg', form);
    const btn = $('button[type="submit"]', form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      if (!input.value || !input.checkValidity()) {
        msg.textContent = 'Please enter a valid work email.';
        input.focus();
        return;
      }

      if (!HUBSPOT.SUBMIT_TO_HUBSPOT) {
        form.classList.add('is-done');
        msg.textContent = 'Thanks! (Demo mode: nothing was sent.)';
        return;
      }

      btn.disabled = true;
      const params = new URLSearchParams(location.search);
      const fields = [{ name: 'email', value: input.value }];
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'].forEach((k) => {
        if (params.get(k)) fields.push({ name: k, value: params.get(k) });
      });
      try {
        const res = await fetch(`https://api-${HUBSPOT.region}.hsforms.com/submissions/v3/integration/submit/${HUBSPOT.portalId}/${HUBSPOT.formId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields,
            context: { hutk: getCookie('hubspotutk'), pageUri: location.href, pageName: document.title },
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        form.classList.add('is-done');
        msg.textContent = "Thanks! We'll be in touch soon.";
      } catch {
        // Fall back to the hosted early-access page.
        location.href = `https://noon.security/request-early-access?email=${encodeURIComponent(input.value)}`;
      } finally {
        btn.disabled = false;
      }
    });
  });
})();
