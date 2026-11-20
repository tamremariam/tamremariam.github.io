/*
 * Wires the space scenery to the page. Everything else on the page reaches it through Space.app.
 */
(() => {
  'use strict';

  const { Pointer, Starfield, Galaxy, HyperJump, reducedMotion: reduce } = Space;
  const $ = id => document.getElementById(id);

  const pointer = new Pointer();
  const starfield = new Starfield($('space'), { pointer, floor: $('floor'), reduce });

  let galaxy = null;
  if (typeof THREE === 'undefined') {
    // Three.js failed to load: show the CSS fallback instead of the 3D galaxy
    $('ring').outerHTML = '<div id="ring"><div class="ring-fallback"></div></div>';
  } else {
    galaxy = new Galaxy($('ring'), { starfield, pointer, reduce });
    new HyperJump({
      galaxy, starfield, reduce,
      button: $('warp'),
      hint: document.querySelector('.drag-hint'),
      captionHost: document.querySelector('.hero') || document.body
    });
  }

  // hold Space to warp
  const typing = () => /INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName);
  addEventListener('keydown', e => { if (e.code === 'Space' && !typing()) { e.preventDefault(); starfield.warpOn(); } });
  addEventListener('keyup', e => { if (e.code === 'Space') starfield.warpOff(); });

  Space.app = { pointer, starfield, galaxy };
})();
