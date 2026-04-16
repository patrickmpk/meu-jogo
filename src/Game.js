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
import { getAvailableWeapons } from './entities/WeaponSystem.js';

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

    this.scene  = this.renderer.scene;
    this.camera = this.renderer.camera;

    this.renderer.onUpdate = (dt) => this._update(dt);

    this.input.onLock   = () => this._onPointerLock();
    this.input.onUnlock = () => this._onPointerUnlock();

    document.addEventListener('click', (e) => {
      if (e.target.id === 'restartBtn') this.restartGame();
    });

    this.renderer.start();
    this._gameStartTime = 0;
  }

  // ── Ciclo de vida do jogo ─────────────────────────────────

  startGame() {
    this.audio.init();
    this._buildWorld();

    this._overlay.classList.add('hidden');
    this.hud.show();

    this.input.requestLock(this._canvas);

    this.state = GAME_STATE.PLAYING;
    this._gameStartTime = Date.now();

    this.enemyManager.startWave(1);
    this.hud.setWave(1);
    this.hud.showWaveNotification(1);
    this.audio.playWaveStart();
  }

  restartGame() {
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
    this.weapon.onWeaponChange = (cfg) => {
      this.hud.setWeaponName(cfg.name);
      this.hud.setAmmo(this.weapon.ammoInfo.mag, this.weapon.ammoInfo.reserve, this.weapon.ammoInfo.maxMag);
    };

    // ── Input: tiro, recarga e troca de arma ──────────────
    this.input.onShoot  = () => { if (this.state === GAME_STATE.PLAYING) this.weapon.shoot(); };
    this.input.onReload = () => { if (this.state === GAME_STATE.PLAYING) this.weapon.startReload(); };
    this.input.onWeaponSelect = (index) => {
      if (this.state === GAME_STATE.PLAYING) this.weapon.selectWeaponByIndex(index);
    };

    // ── Partículas ─────────────────────────────────────────
    this.particles = new ParticleSystem(this.scene);

    // ── Inimigos ───────────────────────────────────────────
    this.enemyManager = new EnemyManager(
      this.scene,
      this.level.getEnemySpawnPoints(),
      this.collision
    );

    this.enemyManager.onEnemyDie      = (enemy, pts) => this._onEnemyDie(enemy, pts);
    this.enemyManager.onWaveComplete   = (w)   => this._onWaveComplete(w);
    this.enemyManager.onAmmoBoxCollect = (amt) => this._onAmmoCollect(amt);
    this.enemyManager.onWaveStart      = (w)   => {
      this.hud.setWave(w);
      this.hud.showWaveNotification(w);
      this.audio.playWaveStart();

      // Atualiza round na arma (desbloqueia armas, aumenta reservas)
      this.weapon.setRound(w);

      // Notifica novidades de armas no HUD
      this._notifyNewWeapons(w);
    };

    this.weapon.targets = this.enemyManager.getTargetMeshes();

    // ── Estatísticas ────────────────────────────────────────
    this._score  = 0;
    this._kills  = 0;

    // ── HUD inicial ─────────────────────────────────────────
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setAmmo(
      this.weapon.ammoInfo.mag,
      this.weapon.ammoInfo.reserve,
      this.weapon.ammoInfo.maxMag
    );
    this.hud.setScore(0);
    this.hud.setWeaponName(this.weapon.weaponName);
  }

  _destroyWorld() {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.enemyManager?.reset();
    this.particles?.dispose();
    this.input.onShoot       = null;
    this.input.onReload      = null;
    this.input.onWeaponSelect = null;

    // Remove HUD de seleção de arma
    document.getElementById('weaponSelectHUD')?.remove();
  }

  // ── Loop principal ────────────────────────────────────────

  _update(dt) {
    if (this.state !== GAME_STATE.PLAYING) return;

    this.player.update(dt);

    this.weapon.targets = this.enemyManager.getTargetMeshes();
    this.weapon.update(
      dt,
      this.camera.position,
      this.player.yaw,
      this.player.pitch,
      this.player._isMoving
    );

    this.enemyManager.update(dt, this.player.position, this.camera);

    this._checkEnemyContactDamage(dt);

    this.particles.update(dt);

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

  _onAmmoCollect(amount) {
    this.weapon.addAmmo(amount);
    this.hud.showAmmoPickup(amount);
    this.audio.playAmmoPickup?.();
  }

  _onWaveComplete(wave) {
    console.log(`[Game] Onda ${wave} completa!`);
  }

  _notifyNewWeapons(wave) {
    const available = getAvailableWeapons(wave);
    const prevAvail = getAvailableWeapons(wave - 1);
    const newWeapons = available.filter(w => !prevAvail.find(p => p.id === w.id));

    if (newWeapons.length > 0) {
      for (const w of newWeapons) {
        this.hud.showUnlockNotification(`🔫 Nova arma desbloqueada: ${w.name}!`);
      }
    }
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

      await this.menuUI.refresh();
    }, 800);
  }

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

  handleCanvasClick() {
    if (this.state === GAME_STATE.PAUSED) {
      this.input.requestLock(this._canvas);
    }
  }
}
