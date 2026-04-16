/**
 * MenuUI.js
 * Interface completa da tela inicial:
 * - Registro/login de jogador
 * - Ranking mensal (leaderboard top-100)
 * - Card do jogador com airdrop-points
 * - Tabela de recompensas por tier
 * - Painel de claim de recompensa diária
 * - Banner de Airdrop futuro
 */

import { API, Session } from './api.js';

// ── Paleta de tiers (espelho do backend) ──────────────────────────────────────
const TIER_STYLE = {
  legend:   { color: '#FFD700', bg: 'rgba(255,215,0,0.12)',   emoji: '👑', label: 'LEGEND'   },
  diamond:  { color: '#B9F2FF', bg: 'rgba(185,242,255,0.10)', emoji: '💎', label: 'DIAMOND'  },
  platinum: { color: '#E5E4E2', bg: 'rgba(229,228,226,0.10)', emoji: '🏆', label: 'PLATINUM' },
  gold:     { color: '#FFA500', bg: 'rgba(255,165,0,0.12)',   emoji: '🥇', label: 'GOLD'     },
  silver:   { color: '#C0C0C0', bg: 'rgba(192,192,192,0.10)', emoji: '🥈', label: 'SILVER'   },
  bronze:   { color: '#CD7F32', bg: 'rgba(205,127,50,0.12)',  emoji: '🥉', label: 'BRONZE'   },
};

function tierStyle(tierId) {
  return TIER_STYLE[tierId] || { color: '#888', bg: 'rgba(128,128,128,0.1)', emoji: '🎮', label: tierId?.toUpperCase() || '—' };
}

// ── Formatador de número ──────────────────────────────────────────────────────
const fmt  = n => Number(n).toLocaleString('pt-BR');
const fmtAP = n => (Math.round(Number(n) * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1 });

export class MenuUI {
  constructor() {
    this._overlay       = document.getElementById('overlay');
    this._playerSection = null;
    this._lbSection     = null;
    this._rewardSection = null;
    this._currentPlayer = null;
    this._lbData        = null;
    this._rewardTable   = null;
    this._onStartGame   = null; // callback

    this._inject();
    this._bindGlobal();
  }

  /** @param {Function} cb - chamado quando jogador clica em "Iniciar Jogo" */
  set onStartGame(cb) { this._onStartGame = cb; }

  // ── Injeção do HTML da UI ─────────────────────────────────────────────────

  _inject() {
    // Remove conteúdo existente do overlay (botão start e subtítulo originais)
    this._overlay.innerHTML = '';

    this._overlay.insertAdjacentHTML('beforeend', `
    <!-- ═══════════════ HEADER ═══════════════ -->
    <div class="menu-header">
      <h1 class="menu-title">🔫 SHADOW STRIKE</h1>
      <p class="menu-sub">First Person Shooter · WebGL</p>
    </div>

    <!-- ═══════════════ AIRDROP BANNER ═══════════════ -->
    <div class="airdrop-banner" id="airdropBanner">
      <div class="ab-glow"></div>
      <div class="ab-content">
        <span class="ab-icon">🪂</span>
        <div class="ab-text">
          <strong>AIRDROP EM BREVE</strong>
          <span>Os top 100 jogadores mensais receberão tokens reais. Acumule <em>Airdrop Points</em> agora!</span>
        </div>
        <div class="ab-badge">EM BREVE</div>
      </div>
    </div>

    <!-- ═══════════════ MAIN GRID ═══════════════ -->
    <div class="menu-grid">

      <!-- ── COLUNA ESQUERDA: Player Card + Reward ── -->
      <div class="menu-col left-col">

        <!-- Player login/register -->
        <div class="card" id="playerCard">
          <div class="card-title">⚔️ Seu Perfil</div>
          <div id="loginSection">
            <p class="hint-text">Entre com seu nickname para salvar pontuações e receber recompensas.</p>
            <div class="input-row">
              <input type="text" id="nickInput" placeholder="Nickname (2–24 chars)" maxlength="24" autocomplete="off" spellcheck="false"/>
              <input type="text" id="walletInput" placeholder="Wallet (opcional, para airdrop)" maxlength="64" autocomplete="off"/>
            </div>
            <div class="input-btns">
              <button class="btn-primary" id="loginBtn">Entrar / Criar</button>
            </div>
            <div id="loginError" class="form-error"></div>
          </div>
          <div id="profileSection" style="display:none"></div>
        </div>

        <!-- Daily Reward Claim -->
        <div class="card" id="rewardCard" style="display:none">
          <div class="card-title">🎁 Recompensa Diária</div>
          <div id="rewardContent"></div>
        </div>

        <!-- Reward table by tier -->
        <div class="card">
          <div class="card-title">💰 Tabela de Recompensas</div>
          <div id="rewardTable"><div class="loading">Carregando...</div></div>
        </div>

      </div>

      <!-- ── COLUNA DIREITA: Leaderboard ── -->
      <div class="menu-col right-col">
        <div class="card lb-card">
          <div class="lb-header">
            <div class="card-title">🏆 Ranking Mensal</div>
            <div id="monthLabel" class="month-label"></div>
          </div>
          <div id="lbStats" class="lb-stats"></div>
          <div id="lbTable"><div class="loading">Carregando ranking...</div></div>
        </div>
      </div>

    </div>

    <!-- ═══════════════ BOTTOM BAR ═══════════════ -->
    <div class="menu-bottom">
      <button class="btn-start" id="startBtn" disabled>Iniciar Jogo</button>
      <div class="controls-hint">
        WASD — Mover &nbsp;|&nbsp; Mouse — Mirar &nbsp;|&nbsp; LMB — Atirar &nbsp;|&nbsp;
        R — Recarregar &nbsp;|&nbsp; Shift — Correr &nbsp;|&nbsp; ESC — Pausar
      </div>
    </div>
    `);

    this._injectStyles();
    this._loadData();
    this._restoreSession();
  }

  // ── Estilos inline ────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('menuStyles')) return;
    const s = document.createElement('style');
    s.id = 'menuStyles';
    s.textContent = `
    /* ── OVERLAY BASE ──────────────────────────────────── */
    #overlay {
      overflow-y: auto;
      padding: 24px 16px 32px;
      align-items: stretch;
      justify-content: flex-start;
      gap: 0;
    }

    /* ── HEADER ────────────────────────────────────────── */
    .menu-header { text-align:center; margin-bottom:14px; }
    .menu-title  { font-size:clamp(1.8rem,5vw,3.4rem); letter-spacing:.15em; text-transform:uppercase;
                   color:#e8413b; text-shadow:0 0 24px #e8413b99,0 2px 0 #000; }
    .menu-sub    { font-size:.9rem; color:#888; letter-spacing:.08em; margin-top:4px; }

    /* ── AIRDROP BANNER ─────────────────────────────────── */
    .airdrop-banner {
      position:relative; overflow:hidden; border-radius:10px;
      border:1px solid rgba(255,215,0,.35); margin-bottom:18px;
      background:linear-gradient(135deg,rgba(255,215,0,.06),rgba(255,100,0,.06));
    }
    .ab-glow {
      position:absolute; inset:0;
      background:radial-gradient(ellipse at 20% 50%,rgba(255,215,0,.08),transparent 60%);
      animation: abPulse 3s ease-in-out infinite;
    }
    @keyframes abPulse { 0%,100%{opacity:.6} 50%{opacity:1} }
    .ab-content { position:relative; display:flex; align-items:center; gap:14px; padding:12px 18px; }
    .ab-icon    { font-size:2rem; }
    .ab-text    { flex:1; }
    .ab-text strong { display:block; color:#FFD700; font-size:1rem; letter-spacing:.08em; }
    .ab-text span   { font-size:.8rem; color:#ccc; line-height:1.4; }
    .ab-text em     { color:#FFD700; font-style:normal; font-weight:600; }
    .ab-badge {
      background:linear-gradient(135deg,#FFD700,#ff9500);
      color:#000; font-weight:800; font-size:.7rem; letter-spacing:.12em;
      padding:5px 12px; border-radius:20px;
    }

    /* ── GRID ────────────────────────────────────────────── */
    .menu-grid { display:grid; grid-template-columns:340px 1fr; gap:16px; margin-bottom:16px; }
    @media (max-width:860px) { .menu-grid { grid-template-columns:1fr; } }
    .menu-col  { display:flex; flex-direction:column; gap:12px; }

    /* ── CARDS ───────────────────────────────────────────── */
    .card {
      background:rgba(0,0,0,.55); border:1px solid rgba(255,255,255,.1);
      border-radius:10px; padding:16px; backdrop-filter:blur(8px);
    }
    .card-title {
      font-size:.85rem; font-weight:700; letter-spacing:.14em;
      text-transform:uppercase; color:#e8413b; margin-bottom:12px;
      display:flex; align-items:center; gap:6px;
    }

    /* ── FORM ────────────────────────────────────────────── */
    .hint-text  { font-size:.8rem; color:#888; margin-bottom:10px; line-height:1.5; }
    .input-row  { display:flex; flex-direction:column; gap:8px; }
    .input-row input {
      background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.15);
      color:#fff; padding:9px 12px; border-radius:6px; font-size:.9rem;
      outline:none; transition:border .2s;
    }
    .input-row input:focus { border-color:#e8413b; }
    .input-row input::placeholder { color:#666; }
    .input-btns { margin-top:10px; }
    .form-error { color:#f44336; font-size:.78rem; margin-top:6px; min-height:18px; }
    .btn-primary {
      background:#e8413b; color:#fff; border:none; border-radius:6px;
      padding:9px 24px; font-size:.88rem; font-weight:700; letter-spacing:.08em;
      cursor:pointer; transition:background .2s, transform .1s;
    }
    .btn-primary:hover { background:#ff5c56; transform:scale(1.03); }
    .btn-logout {
      background:transparent; color:#666; border:1px solid #444;
      border-radius:6px; padding:5px 12px; font-size:.75rem; cursor:pointer;
      transition:color .2s, border-color .2s;
    }
    .btn-logout:hover { color:#e8413b; border-color:#e8413b; }

    /* ── PROFILE CARD ────────────────────────────────────── */
    .profile-box { display:flex; flex-direction:column; gap:10px; }
    .profile-top { display:flex; align-items:center; gap:12px; }
    .profile-avatar {
      width:46px; height:46px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-size:1.4rem; font-weight:900; flex-shrink:0;
    }
    .profile-info { flex:1; }
    .profile-nick { font-size:1.1rem; font-weight:700; color:#fff; }
    .profile-tier {
      font-size:.72rem; font-weight:700; letter-spacing:.1em;
      padding:2px 8px; border-radius:12px; display:inline-block; margin-top:3px;
    }
    .profile-stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .pstat {
      background:rgba(255,255,255,.05); border-radius:6px;
      padding:8px 10px;
    }
    .pstat-label { font-size:.65rem; color:#888; letter-spacing:.1em; text-transform:uppercase; }
    .pstat-value { font-size:1.05rem; font-weight:700; color:#fff; margin-top:2px; }
    .ap-highlight { color:#FFD700 !important; }

    /* ── REWARD TABLE ────────────────────────────────────── */
    .rt-row {
      display:grid; grid-template-columns:90px 1fr auto;
      align-items:center; gap:8px; padding:7px 10px;
      border-radius:6px; margin-bottom:4px;
      font-size:.8rem; transition:background .2s;
    }
    .rt-row:hover { filter:brightness(1.15); }
    .rt-tier { font-weight:700; letter-spacing:.06em; }
    .rt-ranks { color:#aaa; font-size:.74rem; }
    .rt-ap   { font-weight:700; text-align:right; white-space:nowrap; }
    .rt-header {
      display:grid; grid-template-columns:90px 1fr auto;
      padding:0 10px 6px; font-size:.68rem; color:#666;
      letter-spacing:.1em; text-transform:uppercase;
    }

    /* ── LEADERBOARD ─────────────────────────────────────── */
    .lb-card { height:100%; display:flex; flex-direction:column; max-height:600px; }
    .lb-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .lb-header .card-title { margin-bottom:0; }
    .month-label {
      font-size:.75rem; color:#888; background:rgba(255,255,255,.06);
      padding:3px 10px; border-radius:12px;
    }
    .lb-stats {
      display:flex; gap:12px; margin-bottom:10px; flex-wrap:wrap;
    }
    .lb-stat {
      background:rgba(255,255,255,.05); border-radius:6px;
      padding:5px 10px; font-size:.72rem; color:#aaa;
      display:flex; gap:5px; align-items:center;
    }
    .lb-stat strong { color:#fff; }
    #lbTable { overflow-y:auto; flex:1; }

    /* Tabela de ranking */
    .lb-tbl { width:100%; border-collapse:collapse; font-size:.82rem; }
    .lb-tbl th {
      text-align:left; padding:5px 8px; font-size:.65rem;
      letter-spacing:.1em; color:#666; text-transform:uppercase;
      border-bottom:1px solid rgba(255,255,255,.06); position:sticky; top:0;
      background:rgba(0,0,0,.7); z-index:1;
    }
    .lb-tbl td { padding:6px 8px; border-bottom:1px solid rgba(255,255,255,.04); }
    .lb-tbl tr:hover td { background:rgba(255,255,255,.04); }
    .lb-tbl tr.my-row td { background:rgba(232,65,59,.1) !important; }

    /* Rank medal */
    .rank-cell { font-weight:700; width:38px; }
    .medal-1 { color:#FFD700; text-shadow:0 0 8px #FFD700; }
    .medal-2 { color:#C0C0C0; }
    .medal-3 { color:#CD7F32; }

    .tier-badge {
      font-size:.7rem; font-weight:700; letter-spacing:.06em;
      padding:2px 6px; border-radius:10px;
    }
    .nick-cell { font-weight:600; max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .score-cell { color:#fff; font-weight:700; }
    .ap-cell   { color:#FFD700; font-weight:600; }
    .you-tag {
      font-size:.62rem; background:#e8413b; color:#fff;
      padding:1px 5px; border-radius:8px; margin-left:4px;
    }

    /* ── REWARD DAILY CARD ───────────────────────────────── */
    .reward-box { display:flex; flex-direction:column; gap:8px; }
    .reward-tier-big {
      text-align:center; padding:14px;
      border-radius:8px; border:1px solid;
    }
    .reward-tier-big .tier-emoji { font-size:2.2rem; }
    .reward-tier-big .tier-name  { font-size:1.1rem; font-weight:800; letter-spacing:.12em; margin-top:4px; }
    .reward-tier-big .tier-pts   { font-size:.85rem; color:#ccc; margin-top:3px; }
    .btn-claim {
      background:linear-gradient(135deg,#FFD700,#ff9500);
      color:#000; border:none; border-radius:6px; padding:10px 20px;
      font-size:.9rem; font-weight:800; letter-spacing:.08em;
      cursor:pointer; transition:transform .15s, box-shadow .15s;
      box-shadow:0 0 16px rgba(255,215,0,.25);
    }
    .btn-claim:hover { transform:scale(1.04); box-shadow:0 0 28px rgba(255,215,0,.45); }
    .btn-claim:disabled { opacity:.45; cursor:not-allowed; transform:none; }
    .claimed-msg { text-align:center; color:#888; font-size:.8rem; padding:8px; }

    /* ── BOTTOM BAR ──────────────────────────────────────── */
    .menu-bottom { text-align:center; }
    .btn-start {
      padding:14px 56px; font-size:1.15rem; font-weight:800;
      letter-spacing:.12em; text-transform:uppercase;
      background:#e8413b; color:#fff; border:none; border-radius:6px;
      cursor:pointer; box-shadow:0 0 24px #e8413b88;
      transition:background .2s, box-shadow .2s, transform .1s, opacity .2s;
    }
    .btn-start:hover:not(:disabled) { background:#ff5c56; box-shadow:0 0 36px #e8413bbb; transform:scale(1.04); }
    .btn-start:disabled { opacity:.4; cursor:not-allowed; box-shadow:none; }
    .controls-hint { margin-top:10px; font-size:.76rem; color:#666; line-height:1.7; }

    /* ── MISC ────────────────────────────────────────────── */
    .loading { color:#666; font-size:.82rem; padding:12px; text-align:center; }
    .wallet-mini { font-size:.7rem; color:#666; }
    `;
    document.head.appendChild(s);
  }

  // ── Carrega dados do servidor ─────────────────────────────────────────────

  async _loadData() {
    try {
      const [lbData, rtData] = await Promise.all([
        API.getLeaderboard(),
        API.getRewardTable(),
      ]);
      this._lbData      = lbData;
      this._rewardTable = rtData.tiers;
      this._renderLeaderboard(lbData);
      this._renderRewardTable(rtData.tiers);
    } catch (e) {
      document.getElementById('lbTable').innerHTML =
        `<div class="loading" style="color:#f44">Erro ao carregar dados: ${e.message}</div>`;
    }
  }

  // ── Session restore ───────────────────────────────────────────────────────

  async _restoreSession() {
    const saved = Session.get();
    if (!saved) return;
    try {
      const data = await API.getProfile(saved.id);
      this._currentPlayer = { ...data.player, ...data };
      this._showProfile(data);
      document.getElementById('startBtn').disabled = false;
    } catch {
      Session.clear();
    }
  }

  // ── Bind events ───────────────────────────────────────────────────────────

  _bindGlobal() {
    // delegação de eventos
    document.addEventListener('click', async (e) => {
      // Login button
      if (e.target.id === 'loginBtn') await this._handleLogin();

      // Logout
      if (e.target.id === 'logoutBtn') this._handleLogout();

      // Start game
      if (e.target.id === 'startBtn' && !e.target.disabled) {
        this._onStartGame?.();
      }

      // Claim reward
      if (e.target.id === 'claimBtn') await this._handleClaim();
    });

    // Enter key no input
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.getElementById('nickInput') === document.activeElement) {
        this._handleLogin();
      }
    });
  }

  // ── Login / Register ──────────────────────────────────────────────────────

  async _handleLogin() {
    const nick   = document.getElementById('nickInput')?.value?.trim();
    const wallet = document.getElementById('walletInput')?.value?.trim() || null;
    const errEl  = document.getElementById('loginError');
    const btn    = document.getElementById('loginBtn');

    errEl.textContent = '';
    if (!nick) { errEl.textContent = 'Digite um nickname.'; return; }

    btn.disabled    = true;
    btn.textContent = 'Entrando…';
    try {
      const data = await API.register(nick, wallet);
      this._currentPlayer = { ...data.player, ...data };

      // Recarrega perfil completo
      const profile = await API.getProfile(data.player.id);
      this._currentPlayer = profile;

      this._showProfile(profile);
      document.getElementById('startBtn').disabled = false;

      // Refresh leaderboard para destacar row do jogador
      if (this._lbData) this._renderLeaderboard(this._lbData);
    } catch (e) {
      errEl.textContent = e.message || 'Erro ao entrar.';
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Entrar / Criar';
    }
  }

  _handleLogout() {
    Session.clear();
    this._currentPlayer = null;
    document.getElementById('loginSection').style.display = '';
    document.getElementById('profileSection').style.display = 'none';
    document.getElementById('rewardCard').style.display = 'none';
    document.getElementById('startBtn').disabled = true;
    document.getElementById('nickInput').value = '';
    document.getElementById('walletInput').value = '';
    if (this._lbData) this._renderLeaderboard(this._lbData);
  }

  // ── Renderiza perfil ──────────────────────────────────────────────────────

  _showProfile(data) {
    const { player, airdropPoints, currentRank, currentTier } = data;
    const loginSec   = document.getElementById('loginSection');
    const profileSec = document.getElementById('profileSection');

    loginSec.style.display   = 'none';
    profileSec.style.display = '';

    const ts = currentTier ? tierStyle(currentTier.id) : tierStyle(null);
    const rankLabel = currentRank
      ? `#${currentRank} · ${ts.emoji} ${ts.label}`
      : 'Sem rank (jogue uma partida!)';

    profileSec.innerHTML = `
      <div class="profile-box">
        <div class="profile-top">
          <div class="profile-avatar" style="background:${ts.bg};border:2px solid ${ts.color}30">
            ${ts.emoji}
          </div>
          <div class="profile-info">
            <div class="profile-nick">${this._esc(player.nickname)}</div>
            <span class="profile-tier" style="background:${ts.bg};color:${ts.color};border:1px solid ${ts.color}40">
              ${rankLabel}
            </span>
          </div>
          <button class="btn-logout" id="logoutBtn">Sair</button>
        </div>
        <div class="profile-stats">
          <div class="pstat">
            <div class="pstat-label">🪂 Airdrop Points</div>
            <div class="pstat-value ap-highlight">${fmtAP(airdropPoints?.balance ?? 0)} AP</div>
          </div>
          <div class="pstat">
            <div class="pstat-label">📈 Total Ganho</div>
            <div class="pstat-value ap-highlight">${fmtAP(airdropPoints?.totalEarned ?? 0)} AP</div>
          </div>
          <div class="pstat">
            <div class="pstat-label">🎮 Partidas</div>
            <div class="pstat-value">${fmt(player.total_games)}</div>
          </div>
          <div class="pstat">
            <div class="pstat-label">💀 Kills</div>
            <div class="pstat-value">${fmt(player.total_kills)}</div>
          </div>
          <div class="pstat" style="grid-column:1/-1">
            <div class="pstat-label">🏅 Melhor Score</div>
            <div class="pstat-value" style="color:#f5c518">${fmt(player.best_score)}</div>
          </div>
          ${player.wallet ? `
          <div class="pstat" style="grid-column:1/-1">
            <div class="pstat-label">👛 Wallet (Airdrop)</div>
            <div class="wallet-mini">${this._esc(player.wallet)}</div>
          </div>` : ''}
        </div>
      </div>
    `;

    // Mostra reward card
    this._renderDailyReward(currentRank, data);
  }

  // ── Renderiza recompensa diária ───────────────────────────────────────────

  async _renderDailyReward(rank, profileData) {
    const card    = document.getElementById('rewardCard');
    const content = document.getElementById('rewardContent');
    if (!rank || rank > 100) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    // Tenta buscar dados frescos do rank e score mensal
    let totalScore = 0;
    try {
      const lb = this._lbData;
      if (lb) {
        const me = lb.entries.find(e => e.rank === rank);
        if (me) totalScore = me.totalScore;
      }
    } catch {}

    // Calcula tier localmente (espelhando backend)
    const TIERS_LOCAL = [
      { id:'legend',   ranks:[1,1],    baseAP:500, scoreBonus:0.05 },
      { id:'diamond',  ranks:[2,3],    baseAP:300, scoreBonus:0.04 },
      { id:'platinum', ranks:[4,10],   baseAP:150, scoreBonus:0.03 },
      { id:'gold',     ranks:[11,25],  baseAP:80,  scoreBonus:0.02 },
      { id:'silver',   ranks:[26,50],  baseAP:40,  scoreBonus:0.01 },
      { id:'bronze',   ranks:[51,100], baseAP:15,  scoreBonus:0.005 },
    ];
    const tier   = TIERS_LOCAL.find(t => rank >= t.ranks[0] && rank <= t.ranks[1]);
    if (!tier) { card.style.display = 'none'; return; }

    const bonus  = Math.floor((totalScore / 1000) * tier.scoreBonus * 10) / 10;
    const pts    = Math.round((tier.baseAP + bonus) * 10) / 10;
    const ts     = tierStyle(tier.id);

    // Verifica se já coletou hoje
    let claimed  = false;
    try {
      const hist = await API.getRewardHistory(this._currentPlayer.player.id);
      const today = new Date().toISOString().slice(0, 10);
      claimed = hist.history.some(h => h.reward_date === today);
    } catch {}

    content.innerHTML = `
      <div class="reward-box">
        <div class="reward-tier-big" style="background:${ts.bg};border-color:${ts.color}40">
          <div class="tier-emoji">${ts.emoji}</div>
          <div class="tier-name" style="color:${ts.color}">${ts.label}</div>
          <div class="tier-pts">Rank #${rank} · <strong style="color:#FFD700">${fmtAP(pts)} AP</strong> hoje</div>
          <div style="font-size:.72rem;color:#888;margin-top:4px">
            Base: ${tier.baseAP} AP + bônus de score: +${fmtAP(bonus)} AP
          </div>
        </div>
        ${claimed
          ? `<div class="claimed-msg">✅ Recompensa coletada hoje!<br><span style="font-size:.72rem">Volte amanhã.</span></div>`
          : `<button class="btn-claim" id="claimBtn">🪂 Coletar ${fmtAP(pts)} AP</button>`
        }
        <div style="font-size:.72rem;color:#777;text-align:center">
          Recompensas reiniciam à meia-noite UTC
        </div>
      </div>
    `;
  }

  // ── Handle claim ──────────────────────────────────────────────────────────

  async _handleClaim() {
    const btn = document.getElementById('claimBtn');
    if (!btn) return;
    btn.disabled    = true;
    btn.textContent = 'Coletando…';
    try {
      const res = await API.claimReward();
      // Atualiza o card com feedback
      const content = document.getElementById('rewardContent');
      const ts = tierStyle(res.tier?.id);
      content.innerHTML = `
        <div style="text-align:center;padding:16px 8px">
          <div style="font-size:2.4rem">🪂</div>
          <div style="font-size:1.2rem;font-weight:800;color:#FFD700;margin:6px 0">
            +${fmtAP(res.claimed)} AP coletados!
          </div>
          <div style="color:#aaa;font-size:.82rem">Tier: ${ts.emoji} ${ts.label}</div>
          <div style="color:#888;font-size:.78rem;margin-top:6px">
            Novo saldo: <strong style="color:#FFD700">${fmtAP(res.newBalance)} AP</strong>
          </div>
          <div class="claimed-msg" style="margin-top:8px">Volte amanhã para mais recompensas!</div>
        </div>
      `;
      // Refresh perfil
      if (this._currentPlayer?.player?.id) {
        const data = await API.getProfile(this._currentPlayer.player.id);
        this._currentPlayer = data;
        this._showProfile(data);
      }
    } catch (e) {
      btn.disabled    = false;
      btn.textContent = '🪂 Coletar AP';
      const errEl = document.createElement('div');
      errEl.style.cssText = 'color:#f44;font-size:.78rem;text-align:center;margin-top:4px';
      errEl.textContent = e.message;
      btn.insertAdjacentElement('afterend', errEl);
    }
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────

  _renderLeaderboard(data) {
    const lbDiv   = document.getElementById('lbTable');
    const monthEl = document.getElementById('monthLabel');
    const statsEl = document.getElementById('lbStats');

    if (!data) return;

    // Mês
    const [year, month] = data.month.split('-');
    const monthNames    = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    monthEl.textContent = `${monthNames[+month - 1]} ${year}`;

    // Stats globais
    const m = data.meta;
    statsEl.innerHTML = `
      <div class="lb-stat">👥 <strong>${fmt(m.totalPlayers)}</strong> jogadores</div>
      <div class="lb-stat">🎮 <strong>${fmt(m.totalGames)}</strong> partidas</div>
      <div class="lb-stat">🪂 <strong>${fmtAP(m.totalAirdropDistrib)}</strong> AP distribuídos</div>
    `;

    if (!data.entries.length) {
      lbDiv.innerHTML = '<div class="loading">Sem dados para este mês.</div>';
      return;
    }

    const myId = this._currentPlayer?.player?.id;

    const rows = data.entries.map(e => {
      const isMe = myId && e.rank === data.entries.find(x =>
        this._lbData?.entries?.find(y => y.rank === x.rank && x.nickname === Session.get()?.nickname)
      )?.rank;
      const isMeNick = myId && Session.get()?.nickname === e.nickname;

      const ts    = e.tier ? tierStyle(e.tier.id) : { color:'#888', bg:'rgba(0,0,0,0)', emoji:'', label:'' };
      let rankHtml = `<span class="rank-cell">#${e.rank}</span>`;
      if (e.rank === 1) rankHtml = `<span class="rank-cell medal-1">🥇 1</span>`;
      if (e.rank === 2) rankHtml = `<span class="rank-cell medal-2">🥈 2</span>`;
      if (e.rank === 3) rankHtml = `<span class="rank-cell medal-3">🥉 3</span>`;

      const tierBadge = e.tier
        ? `<span class="tier-badge" style="background:${ts.bg};color:${ts.color};border:1px solid ${ts.color}30">
             ${ts.emoji} ${ts.label}
           </span>`
        : '';

      const youTag = isMeNick ? `<span class="you-tag">VOCÊ</span>` : '';
      const walletEl = e.wallet ? `<div class="wallet-mini">${e.wallet}</div>` : '';

      return `
        <tr class="${isMeNick ? 'my-row' : ''}">
          <td>${rankHtml}</td>
          <td>
            <div class="nick-cell">${this._esc(e.nickname)}${youTag}</div>
            ${tierBadge}
            ${walletEl}
          </td>
          <td class="score-cell">${fmt(e.totalScore)}</td>
          <td>${fmt(e.totalKills)}</td>
          <td class="ap-cell">${fmtAP(e.apBalance)} AP</td>
        </tr>
      `;
    }).join('');

    lbDiv.innerHTML = `
      <table class="lb-tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Jogador</th>
            <th>Score Mensal</th>
            <th>Kills</th>
            <th>🪂 AP</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ── Reward Table ──────────────────────────────────────────────────────────

  _renderRewardTable(tiers) {
    const div = document.getElementById('rewardTable');
    if (!tiers?.length) { div.innerHTML = '<div class="loading">—</div>'; return; }

    const rows = tiers.map(t => {
      const ts = tierStyle(t.id);
      return `
        <div class="rt-row" style="background:${ts.bg};border:1px solid ${ts.color}20">
          <div class="rt-tier" style="color:${ts.color}">${ts.emoji} ${ts.label}</div>
          <div class="rt-ranks">${t.rankLabel}</div>
          <div class="rt-ap" style="color:${ts.color}">
            ${t.baseAP} AP/dia<br>
            <span style="font-size:.68rem;color:#888;">+bônus score</span>
          </div>
        </div>
      `;
    }).join('');

    div.innerHTML = `
      <div class="rt-header">
        <span>Tier</span><span>Ranks</span><span>Recompensa</span>
      </div>
      ${rows}
      <div style="font-size:.7rem;color:#666;margin-top:8px;line-height:1.5;">
        💡 Bônus extra por score: cada 1.000 pts acumulados no mês<br>
        aumenta sua recompensa diária. Quanto mais joga, mais AP!
      </div>
    `;
  }

  // ── Utilitários ───────────────────────────────────────────────────────────

  _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /** Atualiza leaderboard (chamado após game over) */
  async refresh() {
    try {
      this._lbData = await API.getLeaderboard();
      this._renderLeaderboard(this._lbData);
      if (this._currentPlayer?.player?.id) {
        const data = await API.getProfile(this._currentPlayer.player.id);
        this._currentPlayer = data;
        this._showProfile(data);
      }
    } catch {}
  }
}
