/* Landing page behaviour. No inline scripts or handlers: the site's Content Security Policy forbids them. */
(function () {
  'use strict';
  const nav = document.getElementById('nav'), menu = document.getElementById('menu'), burger = document.querySelector('[data-menu-toggle]');
  if (burger && menu) burger.addEventListener('click', () => { const open = menu.classList.toggle('open'); burger.setAttribute('aria-expanded', String(open)); });
  if (nav) addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });
})();
