/**
 * ParticleSystem.js
 * Sistema leve de partículas para efeitos visuais:
 * sangue/impacto em inimigos, faíscas em paredes.
 */

import * as THREE from 'three';

const POOL_SIZE = 200;

/** Representa uma única partícula */
class Particle {
  constructor() {
    this.active   = false;
    this.life     = 0;
    this.maxLife  = 1;
    this.velocity = new THREE.Vector3();
    this.mesh     = null;
  }
}

export class ParticleSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {Particle[]} */
    this._pool = [];
    this._buildPool();
  }

  _buildPool() {
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = new Particle();
      const geo = new THREE.SphereGeometry(0.04, 3, 3);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
      p.mesh = new THREE.Mesh(geo, mat);
      p.mesh.visible = false;
      this.scene.add(p.mesh);
      this._pool.push(p);
    }
  }

  /**
   * Obtém uma partícula livre do pool.
   * @returns {Particle|null}
   */
  _getParticle() {
    return this._pool.find(p => !p.active) ?? null;
  }

  /**
   * Emite burst de partículas num ponto.
   * @param {THREE.Vector3} position
   * @param {number}        count
   * @param {number}        color   - hex color
   * @param {number}        speed
   * @param {number}        life
   */
  emit(position, count = 8, color = 0xff2200, speed = 4, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const p = this._getParticle();
      if (!p) break;

      p.active  = true;
      p.life    = life;
      p.maxLife = life;

      // Velocidade aleatória em esfera
      p.velocity.set(
        (Math.random() - 0.5) * speed * 2,
        Math.random() * speed,
        (Math.random() - 0.5) * speed * 2
      );

      p.mesh.position.copy(position);
      p.mesh.material.color.setHex(color);
      p.mesh.visible = true;
      p.mesh.scale.setScalar(1);
    }
  }

  /**
   * Atualiza todas as partículas ativas.
   * @param {number} dt
   */
  update(dt) {
    const gravity = 9.8 * dt;

    for (const p of this._pool) {
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      // Gravidade
      p.velocity.y -= gravity;

      // Mover
      p.mesh.position.addScaledVector(p.velocity, dt);

      // Fade out por escala
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(t * 0.8 + 0.2);
    }
  }

  dispose() {
    for (const p of this._pool) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this._pool = [];
  }
}
