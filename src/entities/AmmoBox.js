/**
 * AmmoBox.js
 * Caixa de munição coletável no mapa.
 * Pode ser spawned no início de cada rodada (3 caixas) ou dropada por NPCs mortos.
 */

import * as THREE from 'three';

const FLOAT_SPEED  = 1.2;  // velocidade de flutuação
const FLOAT_AMP    = 0.18; // amplitude da flutuação
const ROTATE_SPEED = 1.5;  // velocidade de rotação
const COLLECT_RANGE = 1.8; // distância de coleta

export class AmmoBox {
  /**
   * @param {THREE.Scene}   scene
   * @param {THREE.Vector3} position
   * @param {number}        ammoAmount - quantidade de munição na caixa
   */
  constructor(scene, position, ammoAmount = 200) {
    this.scene      = scene;
    this.position   = position.clone();
    this.position.y = 0.6;
    this.ammoAmount = ammoAmount;
    this.collected  = false;
    this.alive      = true;

    this._floatTimer = Math.random() * Math.PI * 2;
    this._collectAnim = 0; // animação de coleta

    this._buildModel();
    this._group.position.copy(this.position);
    this.scene.add(this._group);

    /** @type {Function|null} onCollect(ammoAmount) */
    this.onCollect = null;
  }

  _buildModel() {
    this._group = new THREE.Group();

    // Corpo da caixa
    const boxGeo = new THREE.BoxGeometry(0.5, 0.38, 0.32);
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
    const box    = new THREE.Mesh(boxGeo, boxMat);
    box.castShadow = true;

    // Topo da caixa (tampa)
    const lidGeo = new THREE.BoxGeometry(0.52, 0.08, 0.34);
    const lidMat = new THREE.MeshLambertMaterial({ color: 0x6B4F10 });
    const lid    = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = 0.23;

    // Faixa amarela (marcação de munição)
    const stripeGeo = new THREE.BoxGeometry(0.52, 0.08, 0.33);
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
    const stripe    = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = -0.02;

    // Símbolo (esfera de bala pequena)
    const bulletGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6);
    const bulletMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
    for (let i = -1; i <= 1; i++) {
      const b = new THREE.Mesh(bulletGeo, bulletMat);
      b.position.set(i * 0.12, 0.05, 0.17);
      b.rotation.x = Math.PI / 2;
      this._group.add(b);
    }

    // Brilho de aura (ponto de luz)
    this._glow = new THREE.PointLight(0xFFD700, 0.6, 3.5);
    this._glow.position.y = 0.4;

    // Label flutuante (texto 3D fake com plano)
    const labelGeo = new THREE.PlaneGeometry(0.6, 0.2);
    const canvas   = document.createElement('canvas');
    canvas.width   = 128;
    canvas.height  = 42;
    const ctx      = canvas.getContext('2d');
    ctx.fillStyle  = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, 128, 42);
    ctx.fillStyle  = '#FFD700';
    ctx.font       = 'bold 22px monospace';
    ctx.textAlign  = 'center';
    ctx.fillText(`+${this.ammoAmount}`, 64, 30);
    const tex      = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
    this._label    = new THREE.Mesh(labelGeo, labelMat);
    this._label.position.y = 0.65;
    this._label.renderOrder = 999;

    this._group.add(box, lid, stripe, this._glow, this._label);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos
   * @param {THREE.Camera}  camera
   */
  update(dt, playerPos, camera) {
    if (!this.alive) return;

    // Animação de coleta
    if (this.collected) {
      this._collectAnim += dt * 4;
      this._group.position.y += dt * 3;
      this._group.scale.setScalar(Math.max(0, 1 - this._collectAnim));
      if (this._collectAnim >= 1) {
        this.scene.remove(this._group);
        this.alive = false;
      }
      return;
    }

    // Flutuação suave
    this._floatTimer += dt * FLOAT_SPEED;
    const floatY = Math.sin(this._floatTimer) * FLOAT_AMP;
    this._group.position.set(this.position.x, this.position.y + floatY, this.position.z);

    // Rotação
    this._group.rotation.y += dt * ROTATE_SPEED;

    // Label vira para câmera
    if (this._label) {
      this._label.quaternion.copy(camera.quaternion);
    }

    // Pulsação do brilho
    this._glow.intensity = 0.4 + Math.sin(this._floatTimer * 2) * 0.2;

    // Verifica coleta pelo jogador
    const dist = new THREE.Vector3(
      this.position.x - playerPos.x,
      0,
      this.position.z - playerPos.z
    ).length();

    if (dist < COLLECT_RANGE) {
      this._collect();
    }
  }

  _collect() {
    if (this.collected) return;
    this.collected = true;
    this.onCollect?.(this.ammoAmount);
  }

  dispose() {
    this.scene.remove(this._group);
    this.alive = false;
  }
}
