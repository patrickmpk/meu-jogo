/**
 * Level.js
 * Constrói o mapa do jogo: chão, teto, paredes, obstáculos e iluminação.
 * Expõe a lista de ColliderBox para o sistema de colisão.
 */

import * as THREE from 'three';

// ── Helpers de material ──────────────────────────────────────────────────────

function wallMat(color, roughness = 0.85) {
  return new THREE.MeshLambertMaterial({ color });
}

function boxMesh(w, h, d, mat, rx = 0, ry = 0, rz = 0) {
  const geo  = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}

export class Level {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    /**
     * Lista de AABBs usados pelo CollisionSystem.
     * Cada item: { min: THREE.Vector3, max: THREE.Vector3 }
     */
    this.colliders = [];

    this._build();
    this._buildLights();
  }

  // ── Construção do nível ──────────────────────────────────────────────────

  _build() {
    const HALF = 30; // metade do tamanho do mapa

    // ── Chão ──────────────────────────────────────────────────
    const floorGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 20, 20);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    const floor    = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // ── Teto ──────────────────────────────────────────────────
    const ceilMat = new THREE.MeshLambertMaterial({ color: 0x1e1e1e });
    const ceil    = new THREE.Mesh(floorGeo.clone(), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 6;
    this.scene.add(ceil);

    // ── Paredes externas ──────────────────────────────────────
    this._addWall(0,   3,  -HALF, HALF * 2, 6, 0.5, 0x555555, 0, HALF, -HALF);       // Norte
    this._addWall(0,   3,   HALF, HALF * 2, 6, 0.5, 0x555555, 0, HALF,  HALF);       // Sul
    this._addWall(-HALF, 3, 0,    0.5, 6, HALF * 2, 0x555555, -HALF, HALF, 0);       // Oeste
    this._addWall( HALF, 3, 0,    0.5, 6, HALF * 2, 0x555555,  HALF, HALF, 0);       // Leste

    // ── Obstáculos internos ───────────────────────────────────
    const obstacles = [
      // [x, z, w, d, h, color]
      [ -8,  -8, 3, 3, 3, 0x4a4a6a ],
      [  8,  -8, 3, 3, 3, 0x4a4a6a ],
      [ -8,   8, 3, 3, 3, 0x4a6a4a ],
      [  8,   8, 3, 3, 3, 0x4a6a4a ],
      [  0,  14, 8, 1.5, 2, 0x6a4a4a ],  // barricada centro-norte
      [  0, -14, 8, 1.5, 2, 0x6a4a4a ],  // barricada centro-sul
      [ 14,   0, 1.5, 8, 2, 0x6a4a4a ],  // barricada centro-leste
      [-14,   0, 1.5, 8, 2, 0x6a4a4a ],  // barricada centro-oeste
      // pilares cantos intermediários
      [-20, -20, 2, 2, 5, 0x3a3a4a ],
      [ 20, -20, 2, 2, 5, 0x3a3a4a ],
      [-20,  20, 2, 2, 5, 0x3a3a4a ],
      [ 20,  20, 2, 2, 5, 0x3a3a4a ],
      // caixas pequenas espalhadas
      [  4,   0, 1.5, 1.5, 1.5, 0x7a5a3a ],
      [ -4,   2, 1.5, 1.5, 1.5, 0x7a5a3a ],
      [  2,  -5, 1.5, 1.5, 1.5, 0x7a5a3a ],
      [ -2,   5, 1.5, 1.5, 1.5, 0x7a5a3a ],
    ];

    obstacles.forEach(([x, z, w, d, h, color]) => {
      this._addBox(x, h / 2, z, w, h, d, color);
    });
  }

  /**
   * Adiciona uma parede (box estático) à cena e à lista de colliders.
   */
  _addWall(px, py, pz, w, h, d, color) {
    const mat  = wallMat(color);
    const mesh = boxMesh(w, h, d, mat);
    mesh.position.set(px, py, pz);
    this.scene.add(mesh);
    this._registerCollider(px, py, pz, w, h, d);
  }

  /**
   * Adiciona um obstáculo genérico.
   */
  _addBox(px, py, pz, w, h, d, color) {
    const mat  = wallMat(color);
    const mesh = boxMesh(w, h, d, mat);
    mesh.position.set(px, py, pz);
    this.scene.add(mesh);
    this._registerCollider(px, py, pz, w, h, d);
  }

  /**
   * Registra um AABB na lista de colliders.
   */
  _registerCollider(cx, cy, cz, w, h, d) {
    this.colliders.push({
      min: new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
      max: new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2),
    });
  }

  // ── Iluminação ───────────────────────────────────────────────────────────

  _buildLights() {
    // Luz ambiente fraca
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    // Luz direcional principal (simula teto)
    const dir = new THREE.DirectionalLight(0xffeedd, 0.8);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far  = 80;
    dir.shadow.camera.left = dir.shadow.camera.bottom = -40;
    dir.shadow.camera.right = dir.shadow.camera.top   =  40;
    this.scene.add(dir);

    // Luzes pontuais espalhadas (lâmpadas no teto)
    const lampPositions = [
      [-12, 5.5, -12], [12, 5.5, -12],
      [-12, 5.5,  12], [12, 5.5,  12],
      [  0, 5.5,   0],
    ];

    lampPositions.forEach(([x, y, z], i) => {
      const colors = [0xff4444, 0x4444ff, 0x44ff44, 0xffaa00, 0xffffff];
      const pt = new THREE.PointLight(colors[i % colors.length], 0.9, 28);
      pt.position.set(x, y, z);
      pt.castShadow = false;
      this.scene.add(pt);

      // Geometria visual da lâmpada
      const bulbGeo = new THREE.SphereGeometry(0.15, 8, 8);
      const bulbMat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
      const bulb    = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x, y, z);
      this.scene.add(bulb);
    });
  }

  /** Retorna lista de colliders do nível */
  getColliders() {
    return this.colliders;
  }

  /**
   * Retorna posições de spawn para inimigos (longe do centro).
   * @returns {THREE.Vector3[]}
   */
  getEnemySpawnPoints() {
    return [
      new THREE.Vector3(-22,  0, -22),
      new THREE.Vector3( 22,  0, -22),
      new THREE.Vector3(-22,  0,  22),
      new THREE.Vector3( 22,  0,  22),
      new THREE.Vector3(  0,  0, -25),
      new THREE.Vector3(  0,  0,  25),
      new THREE.Vector3(-25,  0,   0),
      new THREE.Vector3( 25,  0,   0),
    ];
  }
}
