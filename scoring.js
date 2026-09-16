/**
 * Bonus Bridge Pro — scoring.js
 *
 * The ONE authoritative scoring engine, ported faithfully from
 * ScoreAdjustment.js's "Version 2.1" calculateFinalAnalysis().
 * The older calculateBonusBridgeScore (from the original React app's
 * scoring.js, driven by ScoreProcessor.js) has been retired — it was
 * running in parallel with this one and occasionally producing
 * different numbers for the same deal. This file replaces both.
 *
 * Nothing about the maths below has been changed from ScoreAdjustment.js
 * — same constants, same order of steps, same comments. Only the shape
 * has changed: instead of reading React component state, these
 * functions take plain arguments and return plain objects.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// BONUS BRIDGE SCORING CONSTANTS — Version 2.1
// Adjust these values to tune the scoring system without
// touching the calculation logic below.
// ─────────────────────────────────────────────────────────────

const SCORING = {
    // Base score for all contracts (made or defeated)
    BASE: 30,

    // HCP adjustment per point above/below expected (made contracts)
    SURPLUS_PENALTY: 1.5,      // per HCP point above expected → subtracted from declarer
    DEFICIT_BONUS: 1.5,        // per HCP point below expected → added to declarer

    // Maximum HCP adjustment either way (caps at 8 point surplus/deficit)
    HCP_ADJ_CAP: 12,           // = 8 points × 1.5

    // Contract level bonuses (made contracts)
    GAME_BONUS: 3,
    SMALL_SLAM_BONUS: 8,
    GRAND_SLAM_BONUS: 15,

    // Weak hand part score bonus (deficit > 3, part score only)
    WEAK_PART_SCORE_BONUS: 3,
    WEAK_PART_SCORE_THRESHOLD: 3,  // deficit must exceed this

    // Overtrick bonus (made contracts, max 3 overtricks rewarded)
    OVERTRICK_BONUS: 1,
    OVERTRICK_MAX: 3,

    // Distribution penalty thresholds (suit contracts only, not NT)
    DIST_PENALTY_LOW: 1,       // 3-4 distribution points
    DIST_PENALTY_MID: 2,       // 5-6 distribution points
    DIST_PENALTY_HIGH: 3,      // 7+ distribution points

    // Minimum declarer score for made contracts
    DECLARER_MIN: 3,

    // Defender reward per HCP surplus point (made contracts)
    DEFENDER_REWARD_PER_SURPLUS: 1.0,

    // Defender overtrick reward (only when declarer surplus > 3)
    DEFENDER_OVERTRICK_SURPLUS_THRESHOLD: 3,
    DEFENDER_OVERTRICK_BONUS: 1,

    // Defeated contracts — defender HCP adjustment
    DEFEATED_SURPLUS_BONUS: 1.5,   // per surplus point (strong hand going down)
    DEFEATED_DEFICIT_PENALTY: 0.75, // per deficit point (weak hand going down)
    DEFEATED_HCP_ADJ_CAP: 10,

    // Defeat margin bonuses
    DEFEAT_DOWN1: 2,
    DEFEAT_DOWN2: 5,
    DEFEAT_DOWN3: 8,
    DEFEAT_DOWN4PLUS: 10,

    // Defeated contract level bonuses
    DEFEATED_GAME_BONUS: 3,
    DEFEATED_SLAM_BONUS: 6,
    DEFEATED_GRAND_SLAM_BONUS: 10,

    // Minimum defender score for defeated contracts
    DEFENDER_MIN: 3,

    // Declarer consolation (defeated contracts, weak hand only)
    CONSOLATION_PER_DEFICIT: 0.5,
    CONSOLATION_MAX: 5,
    CONSOLATION_MIN_DOWN1: 2,   // minimum consolation if down 1 and deficit > threshold

    // Vulnerability bonuses — Version 2.1
    VUL_GAME_BONUS: 3,          // extra points to declarer for making a vulnerable game
    VUL_DEFEAT_PER_TRICK: 2,    // extra points to defenders per undertrick when declarer vulnerable
};

// ─────────────────────────────────────────────────────────────
// EXPECTED HCP TABLE — by contract type
// ─────────────────────────────────────────────────────────────
function getExpectedHCP(level, suit) {
    if (level <= 2) return 21;                                    // Part score
    if (level === 3 && suit === 'NT') return 25;                  // 3NT
    if (level === 3 && (suit === '♥' || suit === '♠')) return 23; // 3 major
    if (level === 4 && (suit === '♥' || suit === '♠')) return 24; // 4 major game
    if (level === 4 && suit === 'NT') return 27;                  // 4NT
    if (level === 5 && (suit === '♣' || suit === '♦')) return 27; // 5 minor game
    if (level === 5 && (suit === '♥' || suit === '♠')) return 28; // 5 major
    if (level === 5 && suit === 'NT') return 29;                  // 5NT
    if (level === 6) return 30;                                   // Small slam
    if (level === 7) return 32;                                   // Grand slam
    return 21 + (level * 1.5);                                    // Fallback
}

// ─────────────────────────────────────────────────────────────
// HELPER — is this a game or slam contract?
// ─────────────────────────────────────────────────────────────
function classifyContract(level, suit) {
    const isGame =
        (level === 3 && suit === 'NT') ||
        (level === 4 && (suit === '♥' || suit === '♠')) ||
        (level === 5 && (suit === '♣' || suit === '♦')) ||
        level >= 6;
    const isSmallSlam = level === 6;
    const isGrandSlam = level === 7;
    const isPartScore = !isGame;
    const isNT = suit === 'NT';
    return { isGame, isSmallSlam, isGrandSlam, isPartScore, isNT };
}

// ─────────────────────────────────────────────────────────────
// PARSE — turn a contract string like "4♥ N" or "3NT SXX" into
// its component parts. Kept from the original scoring.js.
// ─────────────────────────────────────────────────────────────
function parseContract(contractString, result, vulnerable) {
    if (!contractString) return null;

    const contractMatch = contractString.match(/(\d)([♣♦♥♠]|NT)\s+([NESW])(X{0,2})/);
    if (!contractMatch) return null;

    const level = parseInt(contractMatch[1], 10);
    const suit = contractMatch[2];
    const declarer = contractMatch[3];
    const doubled = contractMatch[4] || '';

    const isNS = declarer === 'N' || declarer === 'S';
    const vulnerableNS = (vulnerable && vulnerable.ns) || false;
    const vulnerableEW = (vulnerable && vulnerable.ew) || false;

    const declarerVulnerable = isNS ? vulnerableNS : vulnerableEW;
    const requiredTricks = level + 6;
    const actualTricks = requiredTricks + (result || 0);
    const madeContract = result >= 0;

    return {
        level,
        suit,
        declarer,
        doubled,
        isNS,
        declarerVulnerable,
        requiredTricks,
        actualTricks,
        madeContract,
        result: result || 0
    };
}

// ─────────────────────────────────────────────────────────────
// STANDARD (PARTY BRIDGE) SCORE — unchanged from the original
// scoring.js. This is the plain duplicate/party-bridge score,
// shown alongside the Bonus Bridge score, not replaced by it.
// ─────────────────────────────────────────────────────────────
function calculateBridgeScore(contractDetails) {
    if (!contractDetails) return { nsPoints: 0, ewPoints: 0 };

    const {
        level,
        suit,
        isNS,
        declarerVulnerable,
        madeContract,
        result,
        doubled
    } = contractDetails;

    let score = 0;

    if (madeContract) {
        let trickScore = 0;

        if (suit === '♣' || suit === '♦') {
            trickScore = level * 20;
        } else if (suit === '♥' || suit === '♠') {
            trickScore = level * 30;
        } else if (suit === 'NT') {
            trickScore = 40 + (level - 1) * 30;
        }

        if (doubled === 'X') {
            trickScore *= 2;
        } else if (doubled === 'XX') {
            trickScore *= 4;
        }

        score += trickScore;

        if (trickScore >= 100) {
            score += declarerVulnerable ? 500 : 300;
        } else {
            score += 50;
        }

        if (level === 6) {
            score += declarerVulnerable ? 750 : 500;
        } else if (level === 7) {
            score += declarerVulnerable ? 1500 : 1000;
        }

        if (doubled === 'X') {
            score += 50;
        } else if (doubled === 'XX') {
            score += 100;
        }

        if (result > 0) {
            let overtrickPoints = 0;

            if (doubled === 'X') {
                overtrickPoints = result * (declarerVulnerable ? 200 : 100);
            } else if (doubled === 'XX') {
                overtrickPoints = result * (declarerVulnerable ? 400 : 200);
            } else {
                if (suit === '♣' || suit === '♦') {
                    overtrickPoints = result * 20;
                } else if (suit === '♥' || suit === '♠') {
                    overtrickPoints = result * 30;
                } else {
                    overtrickPoints = result * 30;
                }
            }

            score += overtrickPoints;
        }
    } else {
        let undertrickPoints = 0;

        if (doubled === 'X') {
            if (declarerVulnerable) {
                undertrickPoints = 200 + (Math.abs(result) - 1) * 300;
            } else {
                undertrickPoints = 100 + (Math.abs(result) > 1 ? 200 : 0) +
                    (Math.abs(result) > 2 ? (Math.abs(result) - 2) * 300 : 0);
            }
        } else if (doubled === 'XX') {
            if (declarerVulnerable) {
                undertrickPoints = 400 + (Math.abs(result) - 1) * 600;
            } else {
                undertrickPoints = 200 + (Math.abs(result) > 1 ? 400 : 0) +
                    (Math.abs(result) > 2 ? (Math.abs(result) - 2) * 600 : 0);
            }
        } else {
            undertrickPoints = Math.abs(result) * (declarerVulnerable ? 100 : 50);
        }

        score = -undertrickPoints;
    }

    if (isNS) {
        return {
            nsPoints: madeContract ? score : 0,
            ewPoints: madeContract ? 0 : -score
        };
    } else {
        return {
            nsPoints: madeContract ? 0 : -score,
            ewPoints: madeContract ? score : 0
        };
    }
}

// ─────────────────────────────────────────────────────────────
// BONUS BRIDGE SCORE — Version 2.1
// Ported directly from ScoreAdjustment.js's calculateFinalAnalysis().
// This is now the ONLY Bonus Bridge scoring engine in the app.
//
// contract:     { level, suit, declarer, doubled }  (parsed contract)
// result:       number — tricks over/under the contract (e.g. +1, -2, 0)
// vulnerable:   { ns: bool, ew: bool }
// handAnalysis: { totalHCP, singletons, voids, longSuits }
// ─────────────────────────────────────────────────────────────
function calculateBonusBridgeScore(contract, result, vulnerable, handAnalysis) {
    const level = contract.level;
    const suit = contract.suit;
    const declarer = contract.declarer;
    const doubled = contract.doubled || '';

    const madeContract = result >= 0;
    const isNS = declarer === 'N' || declarer === 'S';
    const overtricks = madeContract ? (result || 0) : 0;
    const undertricks = madeContract ? 0 : Math.abs(result || 0);

    const declarerVulnerable = isNS ? ((vulnerable && vulnerable.ns) || false) : ((vulnerable && vulnerable.ew) || false);

    const totalHCP = handAnalysis.totalHCP;
    const singletons = handAnalysis.singletons || 0;
    const voids = handAnalysis.voids || 0;
    const longSuits = handAnalysis.longSuits || 0;

    // Distribution points
    const distributionPoints = (voids * 3) + (singletons * 2) + longSuits;

    // Expected HCP for this contract
    const expectedHCP = getExpectedHCP(level, suit);

    // HCP surplus/deficit
    const hcpSurplus = Math.max(0, totalHCP - expectedHCP);
    const hcpDeficit = Math.max(0, expectedHCP - totalHCP);

    // Contract classification
    const c = classifyContract(level, suit);
    const isGame = c.isGame, isSmallSlam = c.isSmallSlam, isGrandSlam = c.isGrandSlam,
          isPartScore = c.isPartScore, isNT = c.isNT;

    let declarerPoints = 0;
    let defenderPoints = 0;
    let calculationSteps = {};

    // ── MADE CONTRACTS ────────────────────────────────────
    if (madeContract) {

        // Step 1: Base
        const base = SCORING.BASE;

        // Step 2: HCP Adjustment
        const rawHcpAdj = hcpSurplus > 0
            ? -Math.min(hcpSurplus * SCORING.SURPLUS_PENALTY, SCORING.HCP_ADJ_CAP)
            : Math.min(hcpDeficit * SCORING.DEFICIT_BONUS, SCORING.HCP_ADJ_CAP);
        const afterHcp = base + rawHcpAdj;

        // Step 3: Contract Level Bonus
        let levelBonus = 0;
        let levelDescription = 'Part score';
        if (isGrandSlam) { levelBonus = SCORING.GRAND_SLAM_BONUS; levelDescription = 'Grand Slam'; }
        else if (isSmallSlam) { levelBonus = SCORING.SMALL_SLAM_BONUS; levelDescription = 'Small Slam'; }
        else if (isGame) { levelBonus = SCORING.GAME_BONUS; levelDescription = 'Game'; }
        const afterLevel = afterHcp + levelBonus;

        // Step 4: Weak Hand Part Score Bonus
        const weakPartScoreBonus =
            (isPartScore && hcpDeficit > SCORING.WEAK_PART_SCORE_THRESHOLD)
                ? SCORING.WEAK_PART_SCORE_BONUS
                : 0;
        const afterWeakBonus = afterLevel + weakPartScoreBonus;

        // Step 5: Overtrick Bonus
        const overtrickBonus = Math.min(overtricks, SCORING.OVERTRICK_MAX) * SCORING.OVERTRICK_BONUS;
        const afterOvertricks = afterWeakBonus + overtrickBonus;

        // Step 6: Distribution Penalty (suit contracts only)
        let distPenalty = 0;
        if (!isNT) {
            if (distributionPoints >= 7) distPenalty = SCORING.DIST_PENALTY_HIGH;
            else if (distributionPoints >= 5) distPenalty = SCORING.DIST_PENALTY_MID;
            else if (distributionPoints >= 3) distPenalty = SCORING.DIST_PENALTY_LOW;
        }
        const afterDist = afterOvertricks - distPenalty;

        // Step 7: Vulnerability Bonus (game contracts only)
        const vulGameBonus = (isGame && declarerVulnerable) ? SCORING.VUL_GAME_BONUS : 0;
        const afterVul = afterDist + vulGameBonus;

        // Step 8: Declarer Final
        declarerPoints = Math.max(SCORING.DECLARER_MIN, Math.round(afterVul));

        // Step 8: Defender Score on Made Contract
        let defenderBase = hcpSurplus * SCORING.DEFENDER_REWARD_PER_SURPLUS;

        let defenderOvertrickBonus = 0;
        if (hcpSurplus > SCORING.DEFENDER_OVERTRICK_SURPLUS_THRESHOLD && overtricks > 0) {
            defenderOvertrickBonus = overtricks * SCORING.DEFENDER_OVERTRICK_BONUS;
        }

        // Defenders cannot outscore declarers on a made contract
        defenderPoints = Math.min(
            declarerPoints,
            Math.round(defenderBase + defenderOvertrickBonus)
        );
        defenderPoints = Math.max(0, defenderPoints);

        calculationSteps = {
            base, rawHcpAdj, hcpSurplus, hcpDeficit, expectedHCP, afterHcp,
            levelBonus, levelDescription, weakPartScoreBonus, overtrickBonus,
            distPenalty, vulGameBonus, declarerVulnerable,
            declarerFinal: declarerPoints, defenderBase, defenderOvertrickBonus,
            defenderFinal: defenderPoints,
        };

    // ── DEFEATED CONTRACTS ────────────────────────────────
    } else {

        // Step 1: Base for defenders
        const base = SCORING.BASE;

        // Step 2: HCP Adjustment for defenders
        const rawHcpAdj = hcpSurplus > 0
            ? Math.min(hcpSurplus * SCORING.DEFEATED_SURPLUS_BONUS, SCORING.DEFEATED_HCP_ADJ_CAP)
            : -Math.min(hcpDeficit * SCORING.DEFEATED_DEFICIT_PENALTY, SCORING.DEFEATED_HCP_ADJ_CAP);
        const afterHcp = base + rawHcpAdj;

        // Step 3: Defeat Margin Bonus
        // If doubled/redoubled, halve the margin bonus — the penalty is inflated
        // by the double itself, not by defensive skill
        const doubledMultiplier = doubled === 'XX' ? 0.25 : doubled === 'X' ? 0.5 : 1.0;
        let defeatMarginBonus = 0;
        let defeatDescription = '';
        if (undertricks >= 4) { defeatMarginBonus = SCORING.DEFEAT_DOWN4PLUS; defeatDescription = 'Down 4+'; }
        else if (undertricks === 3) { defeatMarginBonus = SCORING.DEFEAT_DOWN3; defeatDescription = 'Down 3'; }
        else if (undertricks === 2) { defeatMarginBonus = SCORING.DEFEAT_DOWN2; defeatDescription = 'Down 2'; }
        else if (undertricks === 1) { defeatMarginBonus = SCORING.DEFEAT_DOWN1; defeatDescription = 'Down 1'; }
        defeatMarginBonus = defeatMarginBonus * doubledMultiplier;
        if (doubled) defeatDescription += doubled === 'XX' ? ' (Redoubled — margin ÷4)' : ' (Doubled — margin ÷2)';
        const afterMargin = afterHcp + defeatMarginBonus;

        // Step 4: Contract Level Bonus for defenders
        let defeatedLevelBonus = 0;
        let defeatedLevelDescription = '';
        if (isGrandSlam) { defeatedLevelBonus = SCORING.DEFEATED_GRAND_SLAM_BONUS; defeatedLevelDescription = 'Grand Slam'; }
        else if (isSmallSlam) { defeatedLevelBonus = SCORING.DEFEATED_SLAM_BONUS; defeatedLevelDescription = 'Small Slam'; }
        else if (isGame) { defeatedLevelBonus = SCORING.DEFEATED_GAME_BONUS; defeatedLevelDescription = 'Game'; }
        const afterLevelBonus = afterMargin + defeatedLevelBonus;

        // Step 5: Vulnerability Penalty — all contracts when declarer vulnerable
        const vulDefeatBonus = declarerVulnerable ? (undertricks * SCORING.VUL_DEFEAT_PER_TRICK) : 0;
        const afterVul = afterLevelBonus + vulDefeatBonus;

        // Step 6: Defender Final
        defenderPoints = Math.max(SCORING.DEFENDER_MIN, Math.round(afterVul));

        // Step 6: Declarer Consolation (weak hand only)
        let consolationPoints = 0;
        if (hcpDeficit > 0) {
            consolationPoints = Math.min(
                hcpDeficit * SCORING.CONSOLATION_PER_DEFICIT,
                SCORING.CONSOLATION_MAX
            );
            if (undertricks === 1 && hcpDeficit > SCORING.WEAK_PART_SCORE_THRESHOLD) {
                consolationPoints = Math.max(consolationPoints, SCORING.CONSOLATION_MIN_DOWN1);
            }
        }
        declarerPoints = Math.round(consolationPoints);

        calculationSteps = {
            base, rawHcpAdj, hcpSurplus, hcpDeficit, expectedHCP, afterHcp,
            defeatMarginBonus, defeatDescription, doubledMultiplier,
            defeatedLevelBonus, defeatedLevelDescription, vulDefeatBonus, declarerVulnerable,
            defenderFinal: defenderPoints, consolationPoints, declarerFinal: declarerPoints,
        };
    }

    // ── ASSIGN POINTS TO CORRECT SIDE ────────────────────
    let nsPoints = 0;
    let ewPoints = 0;

    if (madeContract) {
        if (isNS) { nsPoints = declarerPoints; ewPoints = defenderPoints; }
        else { ewPoints = declarerPoints; nsPoints = defenderPoints; }
    } else {
        if (isNS) { ewPoints = defenderPoints; nsPoints = declarerPoints; }
        else { nsPoints = defenderPoints; ewPoints = declarerPoints; }
    }

    return {
        totalHCP, singletons, voids, longSuits, distributionPoints, expectedHCP,
        hcpSurplus, hcpDeficit, madeContract, overtricks, undertricks,
        nsPoints, ewPoints,
        declarerHCPPercentage: Math.round((totalHCP / 40) * 100),
        defenderHCPPercentage: Math.round(((40 - totalHCP) / 40) * 100),
        contractExpectedTricks: level + 6,
        ...calculationSteps,
    };
}

// ─────────────────────────────────────────────────────────────
// UTILITIES — unchanged from the original scoring.js
// ─────────────────────────────────────────────────────────────
function vulnerabilityDescription(vulnerable) {
    if (!vulnerable) return "None Vulnerable";
    const nsVul = vulnerable.ns || false;
    const ewVul = vulnerable.ew || false;
    if (nsVul && ewVul) return "All Vulnerable";
    if (nsVul) return "NS Vulnerable";
    if (ewVul) return "EW Vulnerable";
    return "None Vulnerable";
}

function determineVulnerability(dealNumber) {
    if (!dealNumber) return { ns: false, ew: false };
    const vulPattern = (dealNumber - 1) % 16;
    switch (vulPattern) {
        case 0: case 7: case 10: case 13:
            return { ns: false, ew: false };
        case 1: case 4: case 11: case 14:
            return { ns: true, ew: false };
        case 2: case 5: case 8: case 15:
            return { ns: false, ew: true };
        case 3: case 6: case 9: case 12:
            return { ns: true, ew: true };
        default:
            return { ns: false, ew: false };
    }
}

function determineDealer(dealNumber) {
    const positions = ["North", "East", "South", "West"];
    const index = (dealNumber - 1) % 4;
    return positions[index];
}

// Export for both CommonJS (Node, if ever needed for tests) and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseContract, calculateBridgeScore, calculateBonusBridgeScore,
        vulnerabilityDescription, determineVulnerability, determineDealer,
        getExpectedHCP, classifyContract, SCORING
    };
} else if (typeof window !== 'undefined') {
    window.BonusBridgeScoring = {
        parseContract, calculateBridgeScore, calculateBonusBridgeScore,
        vulnerabilityDescription, determineVulnerability, determineDealer,
        getExpectedHCP, classifyContract, SCORING
    };
}
