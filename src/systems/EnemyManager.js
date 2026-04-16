/**
 * EnemyManager.js
 * Gerencia o pool de inimigos, ondas de spawn, separação entre inimigos,
 * drop de caixas de munição a cada 5 NPCs mortos e spawn de 3 caixas por onda.
 */

import * as THREE from 'three';
import { Enemy } from '../entities/Enemy.js';
import { AmmoBox } from '../entities/AmmoBox.js';

// ── Configuração das ondas ────────────────────────────────────────────────────
function getWaveConfig(wave) {
  return {
    count:      Math.min(4 + wave * 2, 30),            // mais inimigos por onda
    spawnDelay: Math.max(0.6 - wave * 0.04, 0.15),     // spawns mais rápidos
  };
}

// Posições fixas espalhadas pelo mapa para spawn de caixas de munição
const AMMO_BOX_POSITIONS = [
  new THREE.Vector3(-20, 0,  -5),
  new THREE.Vector3( 20, 0,   5),
  new THREE.Vector3(  5, 0, -20),
  new THREE.Vector3( -5, 0,  20),
  new THREE.Vector3(-18, 0,  18),
  new THREE.Vector3( 18, 0, -18),
  new THREE.Vector3(  0, 0, -22),
  new THREE.Vector3(  0, 0,  22),
  new THREE.Vector3(-22, 0,   0),
  new THREE.Vector3( 22, 0,   0),
  new THREE.Vector3(-10, 0,  10),
  new THREE.Vector3( 10, 0, -10),
];

export class EnemyManager {
  /**
   * @param {THREE.Scene}   scene
   * @param {THREE.Vector3[]} spawnPoints
   * @param {import('../systems/CollisionSystem').CollisionSystem} collision
   */
  constructor(scene, spawnPoints, collision) {
    this.scene       = scene;
    this.spawnPoints = spawnPoints;
    this.collision   = collision;

    /** @type {Enemy[]} lista de inimigos vivos */
    this.enemies  = [];

    /** @type {AmmoBox[]} caixas de munição ativas */
    this.ammoxBoxes = [];

    // ── Estado de onda ──────────────────────────────────────
    this.currentWave   = 1;
    this._toSpawn      = 0;
    this._spawnTimer   = 0;
    this._spawnDelay   = 1.0;
    this._waveActive   = false;
    this._waveEnded    = false;
    this._betweenDelay = 0;

    // ── Estatísticas ────────────────────────────────────────
    this.totalKills    = 0;
    this.score         = 0;
    this._killsSinceLastDrop = 0; // contador para drop de ammo a cada 5 kills

    // ── Callbacks ───────────────────────────────────────────
    /** @type {Function|null} onEnemyDie(enemy, scoreGained) */
    this.onEnemyDie = null;
    /** @type {Function|null} onWaveComplete(wave) */
    this.onWaveComplete = null;
    /** @type {Function|null} onWaveStart(wave) */
    this.onWaveStart = null;
    /** @type {Function|null} onAmmoBoxCollect(amount) */
    this.onAmmoBoxCollect = null;
  }

  // ── Iniciar Ondas ─────────────────────────────────────────

  startWave(wave = this.currentWave) {
    this.currentWave = wave;
    const cfg = getWaveConfig(wave);
    this._toSpawn    = cfg.count;
    this._spawnDelay = cfg.spawnDelay;
    this._spawnTimer = 0;
    this._waveActive = true;
    this._waveEnded  = false;
    this.onWaveStart?.(wave);

    // Spawna 3 caixas de munição ao redor do mapa
    this._spawnWaveAmmoBoxes();
  }

  // ── Spawn de caixas de munição (3 por onda) ───────────────

  _spawnWaveAmmoBoxes() {
    // Embaralha posições e pega 3
    const positions = [...AMMO_BOX_POSITIONS].sort(() => Math.random() - 0.5).slice(0, 3);

    for (const pos of positions) {
      const box = new AmmoBox(this.scene, pos, 200);
      box.onCollect = (amount) => {
        this.onAmmoBoxCollect?.(amount);
      };
      this.ammoxBoxes.push(box);
    }
  }

  // ── Update ────────────────────────────────────────────────

  update(dt, playerPos, camera) {
    // Período entre ondas
    if (this._betweenDelay > 0) {
      this._betweenDelay -= dt;
      if (this._betweenDelay <= 0) {
        this.startWave(this.currentWave + 1);
      }
      // Atualiza caixas de munição mesmo entre ondas
      this._updateAmmoBoxes(dt, playerPos, camera);
      return;
    }

    if (!this._waveActive) return;

    // ── Spawn ──────────────────────────────────────────────
    if (this._toSpawn > 0) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnTimer = this._spawnDelay;
        this._spawnEnemy(playerPos);
        this._toSpawn--;
      }
    }

    // ── Atualiza inimigos vivos ────────────────────────────
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, playerPos, camera, this.collision);
      if (!e.alive) {
        this.enemies.splice(i, 1);
      }
    }

    // ── Separação entre inimigos ───────────────────────────
    this._separate();

    // ── Atualiza caixas de munição ─────────────────────────
    this._updateAmmoBoxes(dt, playerPos, camera);

    // ── Verifica fim de onda ───────────────────────────────
    if (this._toSpawn === 0 && this.enemies.length === 0 && !this._waveEnded) {
      this._waveEnded    = true;
      this._waveActive   = false;
      this._betweenDelay = 5;
      this.onWaveComplete?.(this.currentWave);
    }
  }

  // ── Atualiza caixas de munição ────────────────────────────

  _updateAmmoBoxes(dt, playerPos, camera) {
    for (let i = this.ammoxBoxes.length - 1; i >= 0; i--) {
      const box = this.ammoxBoxes[i];
      box.update(dt, playerPos, camera);
      if (!box.alive) {
        this.ammoxBoxes.splice(i, 1);
      }
    }
  }

  // ── Spawn de inimigo ──────────────────────────────────────

  _spawnEnemy(playerPos) {
    let best  = this.spawnPoints[0];
    let bestD = 0;
    for (const p of this.spawnPoints) {
      const d = p.distanceToSquared(playerPos);
      if (d > bestD) { bestD = d; best = p; }
    }

    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      0,
      (Math.random() - 0.5) * 6
    );
    const pos = best.clone().add(offset);
    pos.y = 0;

    const enemy = new Enemy(this.scene, pos, this.currentWave);

    enemy.onAttack = () => {}; // tratado externamente
    enemy.onDie    = (e) => this._handleEnemyDie(e);

    this.enemies.push(enemy);
  }

  _handleEnemyDie(enemy) {
    const pts = 100 + this.currentWave * 50;
    this.score      += pts;
    this.totalKills ++;
    this._killsSinceLastDrop++;
    this.onEnemyDie?.(enemy, pts);

    // Drop de caixa de munição a cada 5 kills
    if (this._killsSinceLastDrop >= 5) {
      this._killsSinceLastDrop = 0;
      this._dropAmmoBox(enemy.position.clone());
    }
  }

  // ── Drop de caixa de munição do NPC morto ─────────────────

  _dropAmmoBox(pos) {
    // Pequeno offset para não ficar exatamente no centro
    pos.x += (Math.random() - 0.5) * 1.2;
    pos.z += (Math.random() - 0.5) * 1.2;
    pos.y = 0;

    const dropAmount = 50 + this.currentWave * 10; // mais munição em ondas avançadas
    const box = new AmmoBox(this.scene, pos, dropAmount);
    box.onCollect = (amount) => {
      this.onAmmoBoxCollect?.(amount);
    };
    this.ammoxBoxes.push(box);
  }

  // ── Separação ─────────────────────────────────────────────

  _separate() {
    const SEP_RADIUS = 1.0;
    const SEP_FORCE  = 0.12;
    const n = this.enemies.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        if (!a.alive || !b.alive) continue;

        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const d2 = dx * dx + dz * dz;

        if (d2 < SEP_RADIUS * SEP_RADIUS && d2 > 0.001) {
          const d    = Math.sqrt(d2);
          const push = (SEP_RADIUS - d) * SEP_FORCE;
          const nx   = dx / d;
          const nz   = dz / d;

          a.position.x += nx * push;
          a.position.z += nz * push;
          b.position.x -= nx * push;
          b.position.z -= nz * push;
        }
      }
    }
  }

  // ── Raycasting de hit ─────────────────────────────────────

  getTargetMeshes() {
    return this.enemies.filter(e => e.alive).map(e => e.mesh);
  }

  applyHit(hitObject, damage) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      let obj = hitObject;
      while (obj) {
        if (obj === enemy.mesh) {
          enemy.takeDamage(damage);
          return enemy;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  getAttackingEnemies(playerPos, playerRadius) {
    return this.enemies.filter(e =>
      e.alive &&
      e.position.distanceTo(playerPos) < (e.radius + playerRadius + 0.3)
    );
  }

  // ── Reset ─────────────────────────────────────────────────

  reset() {
    for (const e of this.enemies)   e.dispose();
    for (const b of this.ammoxBoxes) b.dispose();
    this.enemies     = [];
    this.ammoxBoxes  = [];
    this._toSpawn    = 0;
    this._waveActive = false;
    this._waveEnded  = false;
    this._betweenDelay = 0;
    this.currentWave = 1;
    this.score       = 0;
    this.totalKills  = 0;
    this._killsSinceLastDrop = 0;
  }
}
