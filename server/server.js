/**
 * server.js
 * API REST do Shadow Strike — leaderboard, players, rewards, airdrop-points.
 * Serve também os arquivos estáticos do jogo.
 */

const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const { DB, monthKey, dateKey } = require('./database');
const {
  calculateDailyReward,
  distributeDaily,
  getRewardTable,
  getTierByRank,
} = require('./rewards');

const app  = express();
const PORT = 4000;

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Servir arquivos estáticos do jogo ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ── Rate limit simples (memória) ─────────────────────────────────────────────
const rateMap = new Map();
function rateLimit(ip, max = 30, windowMs = 60_000) {
  const now  = Date.now();
  const data = rateMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > data.reset) { data.count = 0; data.reset = now + windowMs; }
  data.count++;
  rateMap.set(ip, data);
  return data.count > max;
}

function rl(req, res, next) {
  if (rateLimit(req.ip)) return res.status(429).json({ error: 'Muitas requisições. Tente em 1 minuto.' });
  next();
}

// ── Validadores ───────────────────────────────────────────────────────────────
function validateNickname(nick) {
  if (!nick || typeof nick !== 'string') return 'Nickname obrigatório';
  const clean = nick.trim();
  if (clean.length < 2)  return 'Nickname muito curto (mín. 2 chars)';
  if (clean.length > 24) return 'Nickname muito longo (máx. 24 chars)';
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(clean)) return 'Nickname: use apenas letras, números, _ - .';
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS DE PLAYER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/players/register
 * Cria ou recupera um jogador.
 * Body: { nickname, wallet? }
 */
app.post('/api/players/register', rl, (req, res) => {
  const { nickname, wallet } = req.body;
  const err = validateNickname(nickname);
  if (err) return res.status(400).json({ error: err });

  try {
    const player = DB.upsertPlayer(nickname.trim(), wallet || null);
    const ap     = DB.getAirdropBalance(player.id);
    const rank   = DB.getPlayerRank(player.id);

    res.json({
      ok: true,
      player: {
        id:          player.id,
        nickname:    player.nickname,
        wallet:      player.wallet,
        created_at:  player.created_at,
        total_games: player.total_games,
        total_kills: player.total_kills,
        best_score:  player.best_score,
      },
      airdropPoints: {
        balance:     ap?.balance      ?? 0,
        totalEarned: ap?.total_earned ?? 0,
      },
      currentRank: rank,
    });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Nickname já em uso.' });
    }
    console.error('[/api/players/register]', e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

/**
 * GET /api/players/:id
 * Perfil completo do jogador.
 */
app.get('/api/players/:id', rl, (req, res) => {
  const player = DB.getPlayer(req.params.id);
  if (!player) return res.status(404).json({ error: 'Jogador não encontrado.' });

  const ap      = DB.getAirdropBalance(player.id);
  const rank    = DB.getPlayerRank(player.id);
  const rewards = DB.getRewardHistory(player.id, 10);
  const tier    = rank ? getTierByRank(rank) : null;

  res.json({
    player: {
      id:          player.id,
      nickname:    player.nickname,
      wallet:      player.wallet,
      total_games: player.total_games,
      total_kills: player.total_kills,
      best_score:  player.best_score,
    },
    airdropPoints: {
      balance:     ap?.balance      ?? 0,
      totalEarned: ap?.total_earned ?? 0,
      totalSpent:  ap?.total_spent  ?? 0,
    },
    currentRank: rank,
    currentTier: tier ? { id: tier.id, label: tier.label, color: tier.color, emoji: tier.emoji } : null,
    recentRewards: rewards,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS DE SCORES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/scores/submit
 * Registra o resultado de uma partida.
 * Body: { playerId, score, kills, waveReached, durationSec }
 */
app.post('/api/scores/submit', rl, (req, res) => {
  const { playerId, score, kills, waveReached, durationSec } = req.body;

  if (!playerId)                     return res.status(400).json({ error: 'playerId obrigatório' });
  if (typeof score !== 'number' || score < 0)
                                     return res.status(400).json({ error: 'score inválido' });
  if (score > 10_000_000)            return res.status(400).json({ error: 'score inválido' });

  const player = DB.getPlayer(playerId);
  if (!player) return res.status(404).json({ error: 'Jogador não encontrado.' });

  try {
    const sessionId = DB.submitScore({
      playerId,
      score:       Math.floor(score),
      kills:       Math.max(0, Math.floor(kills || 0)),
      waveReached: Math.max(1, Math.floor(waveReached || 1)),
      durationSec: Math.max(0, Math.floor(durationSec || 0)),
    });

    const rank   = DB.getPlayerRank(playerId);
    const reward = rank ? calculateDailyReward(rank, 0) : null;

    res.json({
      ok:        true,
      sessionId,
      newRank:   rank,
      rankTier:  reward?.tier ?? null,
    });
  } catch (e) {
    console.error('[/api/scores/submit]', e);
    res.status(500).json({ error: 'Erro ao registrar score.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS DE LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/leaderboard?month=YYYY-MM&limit=100
 * Ranking mensal.
 */
app.get('/api/leaderboard', rl, (req, res) => {
  const mk    = req.query.month || monthKey();
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 100));

  // Valida formato do mês
  if (!/^\d{4}-\d{2}$/.test(mk)) return res.status(400).json({ error: 'month inválido (YYYY-MM)' });

  try {
    const rows = DB.getMonthlyLeaderboard(mk, limit);
    const dist = DB.getMonthlyDistribution(mk);
    const stats = DB.getGlobalStats();

    res.json({
      month:   mk,
      entries: rows.map(r => ({
        rank:          Number(r.rank),
        nickname:      r.nickname,
        wallet:        r.wallet ? r.wallet.slice(0, 6) + '…' + r.wallet.slice(-4) : null,
        totalScore:    r.total_score,
        bestScore:     r.best_score,
        gamesPlayed:   r.games_played,
        totalKills:    r.total_kills,
        apBalance:     Math.round(r.ap_balance * 10) / 10,
        apTotalEarned: Math.round(r.ap_total_earned * 10) / 10,
        tier:          getTierByRank(Number(r.rank)),
      })),
      meta: {
        totalPlayers:         stats.totalPlayers,
        totalGames:           stats.totalGames,
        totalAirdropDistrib:  Math.round((dist?.total ?? 0) * 10) / 10,
        playersRewarded:      dist?.players ?? 0,
        currentMonth:         monthKey(),
        today:                dateKey(),
      },
    });
  } catch (e) {
    console.error('[/api/leaderboard]', e);
    res.status(500).json({ error: 'Erro ao buscar leaderboard.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS DE RECOMPENSAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/rewards/table
 * Retorna a tabela de recompensas por tier (para exibição).
 */
app.get('/api/rewards/table', (req, res) => {
  res.json({ tiers: getRewardTable() });
});

/**
 * POST /api/rewards/claim
 * Jogador reivindica recompensa diária (baseada no rank atual).
 * Body: { playerId }
 */
app.post('/api/rewards/claim', rl, (req, res) => {
  const { playerId } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId obrigatório' });

  const player = DB.getPlayer(playerId);
  if (!player)  return res.status(404).json({ error: 'Jogador não encontrado.' });

  // Já recebeu hoje?
  if (DB.hasClaimedToday(playerId)) {
    return res.status(409).json({
      error:    'Recompensa já coletada hoje.',
      nextClaim: new Date(dateKey() + 'T23:59:59Z').getTime() + 1,
    });
  }

  // Pega rank atual
  const mk    = monthKey();
  const lbRow = DB.getMonthlyLeaderboard(mk, 100).find(r => r.player_id === playerId);
  if (!lbRow) {
    return res.status(403).json({ error: 'Você não está no top 100 deste mês.' });
  }

  const rank   = Number(lbRow.rank);
  const reward = calculateDailyReward(rank, lbRow.total_score);
  if (!reward) return res.status(403).json({ error: 'Rank fora da faixa de recompensas.' });

  try {
    DB.recordReward({
      playerId,
      rank,
      tier:          reward.tier.id,
      points:        reward.points,
      scoreSnapshot: lbRow.total_score,
    });

    const ap = DB.getAirdropBalance(playerId);
    res.json({
      ok:        true,
      claimed:   reward.points,
      tier:      reward.tier,
      rank,
      newBalance: ap.balance,
    });
  } catch (e) {
    console.error('[/api/rewards/claim]', e);
    res.status(500).json({ error: 'Erro ao processar recompensa.' });
  }
});

/**
 * POST /api/rewards/distribute  (admin/cron endpoint)
 * Distribui recompensas para todos os top-100.
 * Em produção: proteger com API key.
 */
app.post('/api/rewards/distribute', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== (process.env.ADMIN_KEY || 'shadow-admin-2026')) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  try {
    const result = distributeDaily({ DB });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[/api/rewards/distribute]', e);
    res.status(500).json({ error: 'Erro na distribuição.' });
  }
});

/**
 * GET /api/rewards/history/:playerId
 * Histórico de recompensas do jogador.
 */
app.get('/api/rewards/history/:playerId', rl, (req, res) => {
  const player = DB.getPlayer(req.params.playerId);
  if (!player) return res.status(404).json({ error: 'Jogador não encontrado.' });

  const history = DB.getRewardHistory(req.params.playerId, 30);
  const ap      = DB.getAirdropBalance(req.params.playerId);

  res.json({
    nickname:    player.nickname,
    apBalance:   ap?.balance      ?? 0,
    apEarned:    ap?.total_earned ?? 0,
    history,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATS GLOBAIS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/stats', (req, res) => {
  res.json(DB.getGlobalStats());
});

// ── Start ─────────────────────────────────────────────────────────────────────
// Seed de dados demo REMOVIDO — ranking zerado, apenas jogadores reais aparecem.

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔫 Shadow Strike API — porta ${PORT}`);
  console.log(`   Leaderboard: http://localhost:${PORT}/api/leaderboard`);
  console.log(`   Reward table: http://localhost:${PORT}/api/rewards/table\n`);
});

module.exports = app;
