/**
 * Bonus Bridge Pro — app.js
 * Dashboard + popup-overlay input flow, plain JS, no build step.
 */

class BonusBridgeApp {
    constructor() {
        this.licenseManager = new LicenseManager();
        this.scoring = window.BonusBridgeScoring;

        this.gameNumber = 1;
        this.dealNumber = 1;
        this.scores = { nsTotal: 0, ewTotal: 0, bonusNsTotal: 0, bonusEwTotal: 0 };
        this.history = [];

        // In-progress deal, built up across the popup steps
        this.draft = this.freshDraft();

        this.popupStep = null; // 'contract' | 'tricks' | 'hcp' | 'result' | 'license'

        this.init();
    }

    freshDraft() {
        return {
            level: null, suit: null, declarer: null, doubled: '',
            result: null, tricks: null,
            totalHCP: 20, singletons: 0, voids: 0, longSuits: 0,
            vulnerable: null
        };
    }

    init() {
        const status = this.licenseManager.checkLicenseStatus();
        if (status.needsCode) {
            this.showLicensePopup(status);
        } else {
            this.updateLicenseBar();
        }

        this.renderDashboard();
        this.setupFooterButtons();

        setInterval(() => this.updateLicenseBar(), 5 * 60 * 1000);
    }

    // ─────────────────────────────────────────────
    // LICENSE BAR + GATE
    // ─────────────────────────────────────────────
    updateLicenseBar() {
        const bar = document.getElementById('license-bar');
        const status = this.licenseManager.checkLicenseStatus();
        const cfg = this.licenseManager.config;

        if (status.status === 'lifetime') {
            bar.innerHTML = 'Lifetime access — thank you! 🎉';
        } else if (status.status === 'trial' || status.status === 'annual') {
            const renewLabel = status.status === 'annual' ? 'Renew £10' : '1yr £10';
            bar.innerHTML = `${status.daysLeft} day${status.daysLeft !== 1 ? 's' : ''} left · ` +
                `<a href="${cfg.annualBuyUrl}" target="_blank">${renewLabel}</a> · ` +
                `<a href="${cfg.lifetimeBuyUrl}" target="_blank">Lifetime £25</a>`;
        } else {
            bar.innerHTML = '';
        }
    }

    showLicensePopup(status) {
        this.popupStep = 'license';
        const cfg = this.licenseManager.config;
        const overlay = document.getElementById('popup-overlay');
        const content = document.getElementById('popup-content');

        content.innerHTML = `
            <div class="popup-title">🔑 Licence Required</div>
            <div class="license-message">${this.escapeHtml(status.message)}</div>
            <input type="text" id="license-code-input" class="license-input" inputmode="numeric" maxlength="6" placeholder="000000">
            <button id="license-submit-btn" class="popup-btn popup-btn-primary">Activate Code</button>
            <div id="license-result" style="margin-top:10px;"></div>
        `;
        overlay.classList.remove('hidden');

        const input = document.getElementById('license-code-input');
        const submit = () => {
            const result = this.licenseManager.activateLicense(input.value);
            const resultEl = document.getElementById('license-result');
            resultEl.innerHTML = `<div class="license-message" style="background:${result.success ? '#e8f5ea' : '#fde8e6'};color:${result.success ? '#2d7a3e' : '#c0392b'};">${this.escapeHtml(result.message)}</div>`;
            if (result.success) {
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    this.popupStep = null;
                    this.updateLicenseBar();
                }, 1500);
            }
        };
        document.getElementById('license-submit-btn').addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        input.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
    }

    // ─────────────────────────────────────────────
    // DASHBOARD
    // ─────────────────────────────────────────────
    renderDashboard() {
        document.getElementById('session-info').textContent = `Game ${this.gameNumber} · Deal ${this.dealNumber}`;

        const vuln = this.scoring.determineVulnerability(this.dealNumber);
        const dealer = this.scoring.determineDealer(this.dealNumber);
        document.getElementById('dealer-vuln-info').textContent =
            `Dealer: ${dealer} — ${this.scoring.vulnerabilityDescription(vuln)}`;

        const dashboard = document.getElementById('dashboard');
        const lastDeal = this.history[this.history.length - 1];

        dashboard.innerHTML = `
            <div class="score-cards">
                <div class="score-card">
                    <h3>Party Bridge</h3>
                    <div class="teams">
                        <div class="team"><div class="team-label">NS</div><div class="team-score">${this.scores.nsTotal}</div></div>
                        <div class="team"><div class="team-label">EW</div><div class="team-score">${this.scores.ewTotal}</div></div>
                    </div>
                </div>
                <div class="score-card bonus">
                    <h3>Bonus Bridge</h3>
                    <div class="teams">
                        <div class="team"><div class="team-label">NS</div><div class="team-score">${this.scores.bonusNsTotal}</div></div>
                        <div class="team"><div class="team-label">EW</div><div class="team-score">${this.scores.bonusEwTotal}</div></div>
                    </div>
                </div>
            </div>

            ${lastDeal ? `
                <div class="deal-status">
                    <div class="contract-line">${lastDeal.contractText}</div>
                    <div class="result-line">${lastDeal.resultText} · Party: ${lastDeal.nsPoints}/${lastDeal.ewPoints} · Bonus: ${lastDeal.bonusNsPoints}/${lastDeal.bonusEwPoints}</div>
                </div>
            ` : `<div class="deal-status empty">No deals played yet</div>`}

            <button id="btn-enter-contract" class="primary-action-btn">➕ Enter Deal ${this.dealNumber}</button>

            ${this.history.length > 0 ? `
                <div class="history-section">
                    <h3>History</h3>
                    <div class="history-list">
                        ${this.history.slice().reverse().map(h => `
                            <div class="history-row">
                                <div class="h-deal">${h.dealNumber}</div>
                                <div class="h-contract">${h.contractText}</div>
                                <div class="h-result ${h.madeContract ? 'made' : 'down'}">${h.resultText}</div>
                                <div class="h-scores">P ${h.nsPoints}/${h.ewPoints}<br>B ${h.bonusNsPoints}/${h.bonusEwPoints}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        document.getElementById('btn-enter-contract').addEventListener('click', () => {
            const status = this.licenseManager.checkLicenseStatus();
            if (status.needsCode) { this.showLicensePopup(status); return; }
            this.draft = this.freshDraft();
            this.draft.vulnerable = this.scoring.determineVulnerability(this.dealNumber);
            this.showContractPopup();
        });
    }

    setupFooterButtons() {
        document.getElementById('btn-new-game').addEventListener('click', () => {
            if (confirm('Start a new game? Running totals will reset.')) {
                this.gameNumber++;
                this.dealNumber = 1;
                this.scores = { nsTotal: 0, ewTotal: 0, bonusNsTotal: 0, bonusEwTotal: 0 };
                this.history = [];
                this.renderDashboard();
            }
        });
        document.getElementById('btn-quit').addEventListener('click', () => {
            if (confirm('Close Bonus Bridge Pro?')) window.close();
        });
        document.getElementById('btn-help').addEventListener('click', () => {
            alert('Bonus Bridge Pro\n\nEnter each deal\'s contract, then the result, then the combined HCP and distribution for declarer\'s side. Both standard Party Bridge and Bonus Bridge scores are calculated and tracked.');
        });
    }

    // ─────────────────────────────────────────────
    // POPUP: CONTRACT ENTRY
    // ─────────────────────────────────────────────
    showContractPopup() {
        this.popupStep = 'contract';
        document.getElementById('popup-overlay').classList.remove('hidden');
        this.renderContractPopup();
    }

    renderContractPopup() {
        const d = this.draft;
        const content = document.getElementById('popup-content');
        const suits = [
            { s: '♣', red: false }, { s: '♦', red: true }, { s: '♥', red: true }, { s: '♠', red: false }, { s: 'NT', red: false }
        ];

        content.innerHTML = `
            <div class="popup-title">Enter Contract</div>

            <div class="section-label">Level</div>
            <div class="btn-grid cols-4">
                ${[1,2,3,4].map(n => `<button class="grid-btn level-btn ${d.level === n ? 'selected' : ''}" data-level="${n}">${n}</button>`).join('')}
            </div>
            <div class="btn-grid cols-4" style="margin-top:8px;">
                ${[5,6,7].map(n => `<button class="grid-btn level-btn ${d.level === n ? 'selected' : ''}" data-level="${n}">${n}</button>`).join('')}
            </div>

            <div class="section-label">Suit</div>
            <div class="btn-grid cols-5">
                ${suits.map(({s, red}) => `<button class="grid-btn suit-btn ${red ? 'suit-red' : ''} ${d.suit === s ? 'selected' : ''}" data-suit="${s}">${s}</button>`).join('')}
            </div>

            <div class="section-label">Declarer</div>
            <div class="btn-grid cols-4">
                ${['N','S','E','W'].map(p => `<button class="grid-btn declarer-btn ${d.declarer === p ? 'selected' : ''}" data-declarer="${p}">${p}</button>`).join('')}
            </div>

            <div class="section-label">Doubled</div>
            <div class="btn-grid cols-4">
                <button class="grid-btn doubled-btn ${d.doubled === '' ? 'selected' : ''}" data-doubled="">-</button>
                <button class="grid-btn doubled-btn ${d.doubled === 'X' ? 'selected' : ''}" data-doubled="X">X</button>
                <button class="grid-btn doubled-btn ${d.doubled === 'XX' ? 'selected' : ''}" data-doubled="XX">XX</button>
            </div>

            ${d.level && d.suit && d.declarer ? `<div class="contract-preview">${d.level}${d.suit} ${d.declarer}${d.doubled}</div>` : ''}

            <button id="contract-confirm-btn" class="popup-btn popup-btn-primary" ${!(d.level && d.suit && d.declarer) ? 'disabled' : ''}>Confirm Contract</button>
            <button id="contract-cancel-btn" class="popup-btn popup-btn-secondary">Cancel</button>
        `;

        content.querySelectorAll('.level-btn').forEach(btn => btn.addEventListener('click', () => {
            this.draft.level = parseInt(btn.dataset.level); this.renderContractPopup();
        }));
        content.querySelectorAll('.suit-btn').forEach(btn => btn.addEventListener('click', () => {
            this.draft.suit = btn.dataset.suit; this.renderContractPopup();
        }));
        content.querySelectorAll('.declarer-btn').forEach(btn => btn.addEventListener('click', () => {
            this.draft.declarer = btn.dataset.declarer; this.renderContractPopup();
        }));
        content.querySelectorAll('.doubled-btn').forEach(btn => btn.addEventListener('click', () => {
            this.draft.doubled = btn.dataset.doubled; this.renderContractPopup();
        }));
        document.getElementById('contract-confirm-btn').addEventListener('click', () => {
            if (this.draft.level && this.draft.suit && this.draft.declarer) this.showTricksPopup();
        });
        document.getElementById('contract-cancel-btn').addEventListener('click', () => this.closePopup());
    }

    // ─────────────────────────────────────────────
    // POPUP: TRICKS ENTRY
    // ─────────────────────────────────────────────
    showTricksPopup() {
        this.popupStep = 'tricks';
        this.renderTricksPopup();
    }

    renderTricksPopup() {
        const d = this.draft;
        const required = d.level + 6;
        const content = document.getElementById('popup-content');

        const order = [1,2,3,4,5,6,7,8,9,10,11,12,13,0];
        const buttonsHtml = order.map(n => {
            let cls = 'grid-btn trick-btn';
            if (n < required) cls += ' down';
            else if (n === required) cls += ' exact';
            else cls += ' made';
            if (d.tricks === n) cls += ' selected';
            return `<button class="${cls}" data-tricks="${n}">${n}</button>`;
        }).join('');

        let resultHtml = '';
        if (d.tricks !== null) {
            const result = d.tricks - required;
            const made = result >= 0;
            const text = made ? (result > 0 ? `Made +${result}` : 'Made exactly') : `Down ${Math.abs(result)}`;
            resultHtml = `<div class="result-preview ${made ? 'made' : 'down'}">${text} (${d.tricks} tricks)</div>`;
        }

        content.innerHTML = `
            <div class="popup-title">${d.level}${d.suit} ${d.declarer}${d.doubled} — Tricks Taken</div>
            <div class="trick-required">Required tricks to make: ${required}</div>
            <div class="btn-grid trick-grid">${buttonsHtml}</div>
            ${resultHtml}
            <button id="tricks-confirm-btn" class="popup-btn popup-btn-primary" ${d.tricks === null ? 'disabled' : ''}>Continue</button>
            <button id="tricks-back-btn" class="popup-btn popup-btn-secondary">Back to Contract</button>
        `;

        content.querySelectorAll('.trick-btn').forEach(btn => btn.addEventListener('click', () => {
            const tricks = parseInt(btn.dataset.tricks);
            this.draft.tricks = tricks;
            this.draft.result = tricks - required;
            this.renderTricksPopup();
        }));
        document.getElementById('tricks-confirm-btn').addEventListener('click', () => {
            if (this.draft.tricks !== null) this.showHcpPopup();
        });
        document.getElementById('tricks-back-btn').addEventListener('click', () => this.showContractPopup());
    }

    // ─────────────────────────────────────────────
    // POPUP: HCP / DISTRIBUTION ENTRY
    // ─────────────────────────────────────────────
    showHcpPopup() {
        this.popupStep = 'hcp';
        this.renderHcpPopup();
    }

    renderHcpPopup() {
        const d = this.draft;
        const content = document.getElementById('popup-content');

        const counter = (label, key, min, max) => `
            <div class="counter-row">
                <div class="counter-label">${label}</div>
                <div class="counter-controls">
                    <button class="counter-btn" data-key="${key}" data-dir="-1" ${d[key] <= min ? 'disabled' : ''}>−</button>
                    <div class="counter-value">${d[key]}</div>
                    <button class="counter-btn" data-key="${key}" data-dir="1" ${d[key] >= max ? 'disabled' : ''}>+</button>
                </div>
            </div>
        `;

        content.innerHTML = `
            <div class="popup-title">Combined HCP &amp; Distribution</div>
            <div class="license-message" style="background:#eaf3ff;">Count Declarer + Dummy's combined High Card Points, then add any distribution points.</div>
            ${counter('Combined HCP (Declarer + Dummy)', 'totalHCP', 0, 40)}
            ${counter('Number of Singletons', 'singletons', 0, 4)}
            ${counter('Number of Voids', 'voids', 0, 4)}
            ${counter('Number of Long Suits (6+ cards)', 'longSuits', 0, 4)}
            <button id="hcp-calc-btn" class="popup-btn popup-btn-primary">Calculate Final Score</button>
            <button id="hcp-back-btn" class="popup-btn popup-btn-secondary">Back to Tricks</button>
        `;

        content.querySelectorAll('.counter-btn').forEach(btn => btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const dir = parseInt(btn.dataset.dir);
            this.draft[key] += dir;
            this.renderHcpPopup();
        }));
        document.getElementById('hcp-calc-btn').addEventListener('click', () => this.calculateAndShowResult());
        document.getElementById('hcp-back-btn').addEventListener('click', () => this.showTricksPopup());
    }

    // ─────────────────────────────────────────────
    // CALCULATE + SHOW RESULT
    // ─────────────────────────────────────────────
    calculateAndShowResult() {
        const d = this.draft;
        const contract = { level: d.level, suit: d.suit, declarer: d.declarer, doubled: d.doubled };

        const partyScore = this.scoring.calculateBridgeScore(
            this.scoring.parseContract(`${d.level}${d.suit} ${d.declarer}${d.doubled}`, d.result, d.vulnerable)
        );
        const bonusScore = this.scoring.calculateBonusBridgeScore(
            contract, d.result, d.vulnerable,
            { totalHCP: d.totalHCP, singletons: d.singletons, voids: d.voids, longSuits: d.longSuits }
        );

        const made = d.result >= 0;
        const resultText = made ? (d.result > 0 ? `Made +${d.result}` : 'Made exactly') : `Down ${Math.abs(d.result)}`;
        const contractText = `${d.level}${d.suit} ${d.declarer}${d.doubled}`;

        this.lastResult = {
            dealNumber: this.dealNumber,
            contractText, resultText, madeContract: made,
            nsPoints: partyScore.nsPoints, ewPoints: partyScore.ewPoints,
            bonusNsPoints: bonusScore.nsPoints, bonusEwPoints: bonusScore.ewPoints
        };

        this.renderResultPopup();
    }

    renderResultPopup() {
        this.popupStep = 'result';
        const r = this.lastResult;
        const content = document.getElementById('popup-content');

        content.innerHTML = `
            <div class="popup-title">${r.contractText} — ${r.resultText}</div>

            <div class="score-result-box">
                <div class="sr-title">Party Bridge</div>
                <div class="sr-scores">
                    <div><div class="sr-team-label">NS</div><div class="sr-team-score">${r.nsPoints}</div></div>
                    <div><div class="sr-team-label">EW</div><div class="sr-team-score">${r.ewPoints}</div></div>
                </div>
            </div>

            <div class="score-result-box">
                <div class="sr-title">Bonus Bridge</div>
                <div class="sr-scores">
                    <div><div class="sr-team-label">NS</div><div class="sr-team-score">${r.bonusNsPoints}</div></div>
                    <div><div class="sr-team-label">EW</div><div class="sr-team-score">${r.bonusEwPoints}</div></div>
                </div>
            </div>

            <button id="result-next-btn" class="popup-btn popup-btn-primary">Next Deal →</button>
        `;

        document.getElementById('result-next-btn').addEventListener('click', () => this.commitDeal());
    }

    commitDeal() {
        const r = this.lastResult;
        this.history.push(r);
        this.scores.nsTotal += r.nsPoints;
        this.scores.ewTotal += r.ewPoints;
        this.scores.bonusNsTotal += r.bonusNsPoints;
        this.scores.bonusEwTotal += r.bonusEwPoints;

        this.dealNumber++;
        this.closePopup();
        this.renderDashboard();
    }

    closePopup() {
        document.getElementById('popup-overlay').classList.add('hidden');
        this.popupStep = null;
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.bonusBridgeApp = new BonusBridgeApp();
});
