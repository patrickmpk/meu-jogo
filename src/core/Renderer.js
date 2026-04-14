/**
 * Renderer.js
 * Responsável por criar e gerenciar o WebGLRenderer do Three.js,
 * câmera principal e loop de renderização.
 */

import * as THREE from 'three';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas - elemento canvas do DOM
   */
  constructor(canvas) {
    // ── WebGL Renderer ───────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1a1a2e); // cor de fundo do céu

    // ── Câmera ───────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      75,                                           // FOV
      window.innerWidth / window.innerHeight,       // aspect
      0.05,                                         // near clip
      500                                           // far clip
    );

    // ── Cena principal ───────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.035);

    // ── Clock para delta time ────────────────────────────────
    this.clock = new THREE.Clock();

    // ── Resize handler ───────────────────────────────────────
    window.addEventListener('resize', () => this._onResize());

    // ── Callback do loop (definido externamente) ─────────────
    this.onUpdate = null; // fn(deltaTime)
  }

  /** Ajusta câmera e renderer ao redimensionar a janela */
  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Inicia o loop de animação */
  start() {
    this.renderer.setAnimationLoop(() => {
      const delta = Math.min(this.clock.getDelta(), 0.1); // cap em 100ms
      if (this.onUpdate) this.onUpdate(delta);
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Para o loop */
  stop() {
    this.renderer.setAnimationLoop(null);
  }
}
