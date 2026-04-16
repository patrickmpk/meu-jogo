/**
 * rewards.js
 * Sistema de recompensas diárias por rank.
 * Define as tiers, calcula pontos e distribui airdrop-points.
 */

// ── Tabela de Recompensas por Rank ────────────────────────────────────────────
//
//  A distribuição é baseada numa pool diária fixa (DAILY_POOL_AP)
//  proporcional ao rank. O multiplicador de score aumenta os pontos
//  para jogadores com alto score (incentivo a jogar mais e melhor).
//
//  Tier      Ranks    Base AP/dia   Score Multiplier (por 10k pts)
//  ──────────────────────────────────────────────────────────────
//  LEGEND     #1         500 AP       + 0.05 AP por 1k de score
//  DIAMOND    #2–3       300 AP       + 0.04 AP por 1k de score
//  PLATINUM   #4–10      150 AP       + 0.03 AP por 1k de score
//  GOLD       #11–25      80 AP       + 0.02 AP por 1k de score
//  SILVER     #26–50      40 AP       + 0.01 AP por 1k de score
//  BRONZE     #51–100     15 AP       + 0.005 AP por 1k de score

const TIERS = [
  { id: 'legend',   label: 'LEGEND',   ranks: [1, 1],     baseAP: 500, scoreBonus: 0.05, color: '#FFD700', emoji: '👑' },
  { id: 'diamond',  label: 'DIAMOND',  ranks: [2, 3],     baseAP: 300, scoreBonus: 0.04, color: '#B9F2FF', emoji: '💎' },
  { id: 'platinum', label: 'PLATINUM', ranks: [4, 10],    baseAP: 150, scoreBonus: 0.03, color: '#E5E4E2', emoji: '🏆' },
  { id: 'gold',     label: 'GOLD',     ranks: [11, 25],   baseAP: 80,  scoreBonus: 0.02, color: '#FFA500', emoji: '🥇' },
  { id: 'silver',   label: 'SILVER',   ranks: [26, 50],   baseAP: 40,  scoreBonus: 0.01, color: '#C0C0C0', emoji: '🥈' },
  { id: 'bronze',   label: 'BRONZE',   ranks: [51, 100],  baseAP: 15,  scoreBonus: 0.005,color: '#CD7F32', emoji: '🥉' },
];

/**
 * Retorna a tier pelo rank numérico.
 * @param {number} rank
 * @returns {object|null}
 */
function getTierByRank(rank) {
  return TIERS.find(t => rank >= t.ranks[0] && rank <= t.ranks[1]) ?? null;
}

/**
 * Calcula os airdrop-points a distribuir para um jogador.
 *
 * Fórmula:
 *   AP = baseAP + (totalScore / 1000) * scoreBonus * 1000
 *      = baseAP + totalScore * scoreBonus
 *
 * @param {number} rank        - posição no ranking (1-indexed)
 * @param {number} totalScore  - pontuação mensal acumulada
 * @returns {{ tier: object, points: number }|null}
 */
function calculateDailyReward(rank, totalScore) {
  const tier = getTierByRank(rank);
  if (!tier) return null;

  // Bônus proporcional ao score (incentiva jogar mais)
  const scoreBonus = Math.floor((totalScore / 1000) * tier.scoreBonus * 10) / 10;
  const points     = Math.round((tier.baseAP + scoreBonus) * 10) / 10;

  return { tier, points };
}

/**
 * Processa as recompensas diárias para toda a lista de ranking.
 * Chamado por cron ou pelo endpoint /api/rewards/distribute.
 *
 * @param {{ DB: object }} param
 * @returns {{ distributed: number, totalAP: number, results: object[] }}
 */
function distributeDaily({ DB }) {
  const leaderboard = DB.getMonthlyLeaderboard(undefined, 100);
  const results     = [];
  let   totalAP     = 0;

  for (const entry of leaderboard) {
    const rank   = Number(entry.rank);
    const reward = calculateDailyReward(rank, entry.total_score);
    if (!reward) continue;

    // Verifica se já recebeu hoje
    if (DB.hasClaimedToday(entry.player_id)) continue;

    DB.recordReward({
      playerId:      entry.player_id,
      rank,
      tier:          reward.tier.id,
      points:        reward.points,
      scoreSnapshot: entry.total_score,
    });

    totalAP += reward.points;
    results.push({
      rank,
      nickname:  entry.nickname,
      tier:      reward.tier.label,
      points:    reward.points,
    });
  }

  return { distributed: results.length, totalAP, results };
}

/**
 * Retorna a tabela completa de tiers para exibição no frontend.
 */
function getRewardTable() {
  return TIERS.map(t => ({
    ...t,
    rankLabel: t.ranks[0] === t.ranks[1]
      ? `#${t.ranks[0]}`
      : `#${t.ranks[0]} – #${t.ranks[1]}`,
  }));
}

module.exports = { TIERS, getTierByRank, calculateDailyReward, distributeDaily, getRewardTable };
