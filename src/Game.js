/**
 * Game.js
 * Orquestrador principal do jogo.
 * Coordena todos os sistemas: renderer, input, player, weapon,
 * enemies, collision, HUD, particles, audio e leaderboard.
 */

import * as THREE from 'three';

import { Renderer }        from './core/Renderer.js';
import { InputManager }    from './core/InputManager.js';
import { AudioManager }    from './audio/AudioManager.js';
import { Level }           from './levels/Level.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { EnemyManager }    from './systems/EnemyManager.js';
import { ParticleSystem }  from './systems/ParticleSystem.js';
import { Player }          from './entities/Player.js';
import { Weapon }          from './entities/Weapon.js';
import { HUD }             from './ui/HUD.js';
import { MenuUI }          from './ui/MenuUI.js';
import { API, Session }    from './ui/api.js';

// Estados globais do jogo
const GAME_STATE = {
  MENU:    'MENU',
  PLAYING: 'PLAYING',
  PAUSED:  'PAUSED',
  DEAD:    'DEAD',
};

export class Game {
  constructor() {
    this.state = GAME_STATE.MENU;

    // ── Elemento canvas ────────────────────────────────────
    this._canvas  = document.getElementById('gameCanvas');
    this._overlay = document.getElementById('overlay');

    // ── Sistemas núcleo ────────────────────────────────────
    this.renderer  = new Renderer(this._canvas);
    this.input     = new InputManager();
    this.audio     = new AudioManager();
    this.hud       = new HUD();

    // ── Menu / Leaderboard UI ──────────────────────────────
    this.menuUI = new MenuUI();
    this.menuUI.onStartGame = () => this.startGame();

    // Atalhos
    this.scene  = this.renderer.scene;
    this.camera = this.renderer.camera;

    // ── Bind loop ──────────────────────────────────────────
    this.renderer.onUpdate = (dt) => this._update(dt);

    // ── Pointer lock callbacks ─────────────────────────────
    this.input.onLock   = () => this._onPointerLock();
    this.input.onUnlock = () => this._onPointerUnlock();

    // ── Botão de restart (no HUD game over) ───────────────
    document.addEventListener('click', (e) => {
      if (e.target.id === 'restartBtn') this.restartGame();
    });

    // ── Inicia o loop de renderização ─────────────────────
    this.renderer.start();

    // ── Cronômetro da partida ──────────────────────────────
    this._gameStartTime = 0;
  }

  // ── Ciclo de vida do jogo ─────────────────────────────────

  startGame() {
    // Inicializa o áudio (precisa de interação do usuário)
    this.audio.init();

    // Constrói o mundo
    this._buildWorld();

    // Mostra HUD, esconde menu
    this._overlay.classList.add('hidden');
    this.hud.show();

    // Solicita pointer lock
    this.input.requestLock(this._canvas);

    this.state = GAME_STATE.PLAYING;
    this._gameStartTime = Date.now();

    // Iniciar primeira onda
    this.enemyManager.startWave(1);
    this.hud.setWave(1);
    this.hud.showWaveNotification(1);
    this.audio.playWaveStart();
  }

  restartGame() {
    // Limpa mundo anterior
    this._destroyWorld();
    this.hud.hideGameOver();
    this.startGame();
  }

  _buildWorld() {
    // ── Nível ──────────────────────────────────────────────
    this.level     = new Level(this.scene);

    // ── Colisão ────────────────────────────────────────────
    this.collision = new CollisionSystem(this.level.getColliders());

    // ── Player ─────────────────────────────────────────────
    this.player    = new Player(this.camera, this.input, this.collision);
    this.player.position.set(0, 0, 0);
    this.player.onHurt  = (dmg) => this._onPlayerHurt(dmg);
    this.player.onDeath = ()    => this._onPlayerDeath();

    // ── Arma ───────────────────────────────────────────────
    this.weapon = new Weapon(this.camera, this.scene, this.collision, this.audio);
    this.weapon.onHit = (obj, pt, dmg) => this._onWeaponHit(obj, pt, dmg);
    this.weapon.onAmmoChange = (mag, res) => {
      this.hud.setAmmo(mag, res, this.weapon.ammoInfo.maxMag);
    };

    // ── Input: tiro e recarga ──────────────────────────────
    this.input.onShoot  = () => { if (this.state === GAME_STATE.PLAYING) this.weapon.shoot(); };
    this.input.onReload = () => { if (this.state === GAME_STATE.PLAYING) this.weapon.startReload(); };

    // ── Partículas ─────────────────────────────────────────
    this.particles = new ParticleSystem(this.scene);

    // ── Inimigos ───────────────────────────────────────────
    this.enemyManager = new EnemyManager(
      this.scene,
      this.level.getEnemySpawnPoints(),
      this.collision
    );

    this.enemyManager.onEnemyDie = (enemy, pts) => this._onEnemyDie(enemy, pts);
    this.enemyManager.onWaveComplete = (w) => this._onWaveComplete(w);
    this.enemyManager.onWaveStart    = (w) => {
      this.hud.setWave(w);
      this.hud.showWaveNotification(w);
      this.audio.playWaveStart();
    };

    // Registra targets de raycasting para a arma
    this.weapon.targets = this.enemyManager.getTargetMeshes();

    // ── Estatísticas ────────────────────────────────────────
    this._score      = 0;
    this._kills      = 0;

    // ── HUD inicial ─────────────────────────────────────────
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setAmmo(
      this.weapon.ammoInfo.mag,
      this.weapon.ammoInfo.reserve,
      this.weapon.ammoInfo.maxMag
    );
    this.hud.setScore(0);
  }

  _destroyWorld() {
    // Remove todos os objetos da cena
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.enemyManager?.reset();
    this.particles?.dispose();
    this.input.onShoot  = null;
    this.input.onReload = null;
  }

  // ── Loop principal ────────────────────────────────────────

  _update(dt) {
    if (this.state !== GAME_STATE.PLAYING) return;

    // ── Player ────────────────────────────────────────────
    this.player.update(dt);

    // ── Arma ─────────────────────────────────────────────
    this.weapon.targets = this.enemyManager.getTargetMeshes();
    this.weapon.update(
      dt,
      this.camera.position,
      this.player.yaw,
      this.player.pitch,
      this.player._isMoving
    );

    // ── Inimigos ──────────────────────────────────────────
    this.enemyManager.update(dt, this.player.position, this.camera);

    // ── Dano de contato dos inimigos ───────────────────────
    this._checkEnemyContactDamage(dt);

    // ── Partículas ────────────────────────────────────────
    this.particles.update(dt);

    // ── HUD ──────────────────────────────────────────────
    this.hud.update(dt, this.weapon);
  }

  // ── Handlers de eventos ───────────────────────────────────

  _onWeaponHit(hitObject, point, damage) {
    const enemy = this.enemyManager.applyHit(hitObject, damage);
    if (enemy) {
      this.particles.emit(point, 10, 0xcc1100, 5, 0.4);
    } else {
      this.particles.emit(point, 6, 0xffcc44, 3, 0.25);
    }
  }

  _onEnemyDie(enemy, pts) {
    this._score += pts;
    this._kills ++;
    this.hud.setScore(this._score);
    this.hud.addKillMessage(`+${pts} pts`);
    this.audio.playEnemyDie();

    this.particles.emit(
      enemy.position.clone().setY(1),
      20, 0xff2200, 6, 0.6
    );
  }

  _onWaveComplete(wave) {
    console.log(`[Game] Onda ${wave} completa!`);
  }

  _onPlayerHurt(damage) {
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.triggerHitFlash();
    this.audio.playHurt();
  }

  async _onPlayerDeath() {
    this.state = GAME_STATE.DEAD;
    this.audio.playGameOver();

    const durationSec = Math.floor((Date.now() - this._gameStartTime) / 1000);

    // ── Envia score para o backend ────────────────────────
    let newRank  = null;
    let rankTier = null;
    const player = Session.get();

    if (player) {
      try {
        const res = await API.submitScore({
          score:       this._score,
          kills:       this._kills,
          waveReached: this.enemyManager.currentWave,
          durationSec,
        });
        newRank  = res.newRank;
        rankTier = res.rankTier;
        console.log(`[Game] Score enviado → rank #${newRank}`);
      } catch (e) {
        console.warn('[Game] Falha ao enviar score:', e.message);
      }
    }

    setTimeout(async () => {
      this.hud.showGameOver(
        this._score,
        this.enemyManager.currentWave,
        this._kills,
        newRank,
        rankTier
      );
      this.input.releaseLock();

      // Atualiza leaderboard e perfil no menu
      await this.menuUI.refresh();
    }, 800);
  }

  /** Dano de contato contínuo dos inimigos */
  _checkEnemyContactDamage(dt) {
    const attackers = this.enemyManager.getAttackingEnemies(
      this.player.position,
      this.player.radius
    );
    for (const e of attackers) {
      if (e._attackCooldown <= 0) {
        this.player.takeDamage(10);
        e._attackCooldown = 1.2;
      }
    }
  }

  // ── Pointer Lock ─────────────────────────────────────────

  _onPointerLock() {
    if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.PLAYING;
      this.hud.setPaused(false);
    }
  }

  _onPointerUnlock() {
    if (this.state === GAME_STATE.PLAYING) {
      this.state = GAME_STATE.PAUSED;
      this.hud.setPaused(true);
    }
  }

  /** Clique no canvas para requestLock quando pausado */
  handleCanvasClick() {
    if (this.state === GAME_STATE.PAUSED) {
      this.input.requestLock(this._canvas);
    }
  }
}
