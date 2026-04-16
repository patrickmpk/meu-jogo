/**
 * WeaponSystem.js
 * Define os dados das armas disponíveis no jogo.
 * A cada round, novas armas com mais munição são desbloqueadas.
 */

export const WEAPONS = [
  // ── Round 1 ── Pistola básica
  {
    id:          'pistol',
    name:        'Pistola M9',
    magSize:     15,
    reserveMax:  60,
    reloadTime:  1.4,
    fireRate:    0.22,
    damage:      20,
    color:       0x444466,
    unlockRound: 1,
    recoil:      0.018,
    description: 'Pistola padrão. Confiável e precisa.',
  },
  // ── Round 1 ── Rifle de assalto
  {
    id:          'ar',
    name:        'AR-15',
    magSize:     30,
    reserveMax:  120,
    reloadTime:  1.8,
    fireRate:    0.10,
    damage:      25,
    color:       0x222222,
    unlockRound: 1,
    recoil:      0.022,
    description: 'Rifle automático padrão.',
  },
  // ── Round 3 ── Escopeta
  {
    id:          'shotgun',
    name:        'Escopeta S12',
    magSize:     8,
    reserveMax:  40,
    reloadTime:  2.2,
    fireRate:    0.70,
    damage:      60,
    pellets:     6,
    spread:      0.06,
    color:       0x5a3a1a,
    unlockRound: 3,
    recoil:      0.055,
    description: 'Devastadora a curta distância. Dispara múltiplos projéteis.',
  },
  // ── Round 5 ── SMG
  {
    id:          'smg',
    name:        'SMG Vector',
    magSize:     35,
    reserveMax:  175,
    reloadTime:  1.5,
    fireRate:    0.07,
    damage:      18,
    color:       0x334455,
    unlockRound: 5,
    recoil:      0.016,
    description: 'Cadência de tiro muito alta. Ideal para hordas.',
  },
  // ── Round 7 ── Sniper
  {
    id:          'sniper',
    name:        'Sniper AWP',
    magSize:     5,
    reserveMax:  25,
    reloadTime:  3.0,
    fireRate:    1.0,
    damage:      150,
    color:       0x336633,
    unlockRound: 7,
    recoil:      0.08,
    description: 'Um tiro, uma morte. Dano altíssimo.',
  },
  // ── Round 10 ── LMG
  {
    id:          'lmg',
    name:        'LMG M249',
    magSize:     100,
    reserveMax:  400,
    reloadTime:  4.0,
    fireRate:    0.085,
    damage:      22,
    color:       0x3a3a2a,
    unlockRound: 10,
    recoil:      0.014,
    description: 'Metralhadora pesada. Enorme capacidade de munição.',
  },
  // ── Round 13 ── Lança-granadas (single-shot alto dano)
  {
    id:          'rl',
    name:        'Rocket Launcher',
    magSize:     3,
    reserveMax:  12,
    reloadTime:  3.5,
    fireRate:    1.2,
    damage:      400,
    color:       0x884422,
    unlockRound: 13,
    recoil:      0.12,
    description: 'Dano em área absurdo. Devastador contra grupos.',
  },
];

/**
 * Retorna lista de armas disponíveis no round informado.
 * @param {number} round
 * @returns {typeof WEAPONS}
 */
export function getAvailableWeapons(round) {
  return WEAPONS.filter(w => w.unlockRound <= round);
}

/**
 * Retorna configuração de uma arma pelo id.
 * @param {string} id
 */
export function getWeaponById(id) {
  return WEAPONS.find(w => w.id === id) || WEAPONS[1];
}
