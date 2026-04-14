/**
 * EnemyManager.js
 * Gerencia o pool de inimigos, ondas de spawn e separação entre inimigos.
 */

import * as THREE from 'three';
import { Enemy } from '../entities/Enemy.js';

// ── Configuração das ondas ────────────────────────────────────────────────────
function getWaveConfig(wave) {
  return {
    count:     Math.min(4 + wave * 2, 20),     // inimigos por onda
    spawnDelay: Math.max(0.6 - wave * 0.04, 0.2), // segundos entre spawns
  };
}

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
    this._dead    = []; // aguardando limpeza

    // ── Estado de onda ──────────────────────────────────────
    this.currentWave  = 1;
    this._toSpawn     = 0;       // inimigos restantes para spawnar
    this._spawnTimer  = 0;
    this._spawnDelay  = 1.0;
    this._waveActive  = false;
    this._waveEnded   = false;
    this._betweenDelay = 0;      // pausa entre ondas

    // ── Estatísticas ────────────────────────────────────────
    this.totalKills = 0;
    this.score      = 0;

    // ── Callbacks ───────────────────────────────────────────
    /** @type {Function|null} onEnemyDie(enemy, scoreGained) */
    this.onEnemyDie = null;
    /** @type {Function|null} onWaveComplete(wave) */
    this.onWaveComplete = null;
    /** @type {Function|null} onWaveStart(wave) */
    this.onWaveStart = null;
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
  }

  // ── Update ────────────────────────────────────────────────

  /**
   * @param {number}         dt
   * @param {THREE.Vector3}  playerPos
   * @param {THREE.Camera}   camera
   */
  update(dt, playerPos, camera) {
    // Período entre ondas
    if (this._betweenDelay > 0) {
      this._betweenDelay -= dt;
      if (this._betweenDelay <= 0) {
        this.startWave(this.currentWave + 1);
      }
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

    // ── Verifica fim de onda ───────────────────────────────
    if (this._toSpawn === 0 && this.enemies.length === 0 && !this._waveEnded) {
      this._waveEnded  = true;
      this._waveActive = false;
      this._betweenDelay = 5; // 5 segundos até próxima onda
      this.onWaveComplete?.(this.currentWave);
    }
  }

  // ── Spawn ─────────────────────────────────────────────────

  _spawnEnemy(playerPos) {
    // Escolhe ponto de spawn mais distante do jogador
    let best  = this.spawnPoints[0];
    let bestD = 0;
    for (const p of this.spawnPoints) {
      const d = p.distanceToSquared(playerPos);
      if (d > bestD) { bestD = d; best = p; }
    }

    // Pequena variação aleatória
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      0,
      (Math.random() - 0.5) * 6
    );
    const pos = best.clone().add(offset);
    pos.y = 0;

    const enemy = new Enemy(this.scene, pos);

    // Registra callbacks do inimigo
    enemy.onAttack = (dmg) => {
      // Propagado externamente para o Player (via GameManager)
    };
    enemy.onDie = (e) => this._handleEnemyDie(e);

    this.enemies.push(enemy);
  }

  _handleEnemyDie(enemy) {
    const pts = 100 + this.currentWave * 50;
    this.score      += pts;
    this.totalKills ++;
    this.onEnemyDie?.(enemy, pts);
  }

  // ── Separação ─────────────────────────────────────────────

  /** Impede inimigos de se sobreporem (força de separação) */
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

  /**
   * Retorna todos os meshes dos inimigos para raycasting.
   * @returns {THREE.Object3D[]}
   */
  getTargetMeshes() {
    return this.enemies.filter(e => e.alive).map(e => e.mesh);
  }

  /**
   * Resolve hit de tiro: encontra o inimigo dono do mesh atingido.
   * @param {THREE.Object3D} hitObject
   * @param {number}         damage
   * @returns {Enemy|null}
   */
  applyHit(hitObject, damage) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      // verifica se o objeto atingido é descendente do grupo do inimigo
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

  /**
   * Verifica se algum inimigo está em contato com o jogador.
   * Retorna a lista de inimigos atacando.
   * @param {THREE.Vector3} playerPos
   * @param {number}        playerRadius
   */
  getAttackingEnemies(playerPos, playerRadius) {
    return this.enemies.filter(e =>
      e.alive &&
      e.position.distanceTo(playerPos) < (e.radius + playerRadius + 0.3)
    );
  }

  // ── Reset ─────────────────────────────────────────────────

  reset() {
    for (const e of this.enemies) e.dispose();
    this.enemies     = [];
    this._toSpawn    = 0;
    this._waveActive = false;
    this._waveEnded  = false;
    this._betweenDelay = 0;
    this.currentWave = 1;
    this.score       = 0;
    this.totalKills  = 0;
  }
}
