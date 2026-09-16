/**
 * License Manager — Bonus Bridge Pro
 * Same pattern as Bridge Modes Calculator's license.js: 2-month
 * auto-starting trial, then a 6-digit code for Annual or Lifetime.
 */

// =====================================================
// CONFIG
// =====================================================
const LICENSE_CONFIG = {
    appName: 'Bonus Bridge Pro',
    annualCode: '401025',
    lifetimeCode: '402510',
    annualBuyUrl: 'https://ko-fi.com/s/c2fd4816a9',
    lifetimeBuyUrl: 'https://ko-fi.com/s/5e37dfef28',
    trialDays: 60,              // 2 months
    expiryWarningDays: 7
};
// =====================================================

class LicenseManager {
    constructor(config = LICENSE_CONFIG) {
        this.config = config;
        this.storageKey = 'bonusBridgeProLicense';
        this.firstUseKey = 'bonusBridgeProFirstUse';
        this.annualDays = 365;

        console.log(`🔐 License Manager initialized for ${this.config.appName}`);
    }

    getFirstUseDate() {
        let stored = localStorage.getItem(this.firstUseKey);
        if (!stored) {
            stored = Date.now().toString();
            localStorage.setItem(this.firstUseKey, stored);
            console.log('🆕 First use recorded:', new Date(parseInt(stored)).toLocaleDateString());
        }
        return parseInt(stored);
    }

    getTrialDaysLeft() {
        const firstUse = this.getFirstUseDate();
        const daysElapsed = Math.floor((Date.now() - firstUse) / (1000 * 60 * 60 * 24));
        return Math.max(0, this.config.trialDays - daysElapsed);
    }

    checkLicenseStatus() {
        const license = this.getLicenseData();

        if (license) {
            if (license.type === 'LIFETIME') {
                return {
                    status: 'lifetime',
                    needsCode: false,
                    message: 'Lifetime access active — thank you for your support!'
                };
            }
            if (license.type === 'ANNUAL') {
                return this.checkAnnualExpiry(license);
            }
        }

        const daysLeft = this.getTrialDaysLeft();
        if (daysLeft > 0) {
            const inWarningWindow = daysLeft <= this.config.expiryWarningDays;
            return {
                status: 'trial',
                needsCode: false,
                daysLeft,
                warning: inWarningWindow,
                message: inWarningWindow
                    ? `⚠️ Trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Get Annual (£10/year) or Lifetime (£25) to keep using ${this.config.appName}.`
                    : `Free trial: ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`
            };
        }

        return {
            status: 'trial_expired',
            needsCode: true,
            message: this.getTrialExpiredMessage()
        };
    }

    checkAnnualExpiry(license) {
        const now = Date.now();
        const expiryDate = license.activatedAt + (this.annualDays * 24 * 60 * 60 * 1000);
        const daysLeft = Math.max(0, Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24)));

        if (daysLeft <= 0) {
            return {
                status: 'annual_expired',
                needsCode: true,
                message: `Your annual licence has expired. Renew for £10/year or upgrade to Lifetime for £25.\n\nRenew: ${this.config.annualBuyUrl}\nLifetime: ${this.config.lifetimeBuyUrl}`
            };
        }

        if (daysLeft <= this.config.expiryWarningDays) {
            return {
                status: 'annual',
                needsCode: false,
                daysLeft,
                warning: true,
                message: `⚠️ Licence expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Renew here: ${this.config.annualBuyUrl}`
            };
        }

        return {
            status: 'annual',
            needsCode: false,
            daysLeft,
            warning: false,
            message: `Annual licence active — ${daysLeft} days remaining.`
        };
    }

    getTrialExpiredMessage() {
        return `Your 2-month free trial of ${this.config.appName} has ended.\n\n` +
               `To keep using the full app, choose:\n\n` +
               `• Annual — £10/year: ${this.config.annualBuyUrl}\n` +
               `• Lifetime — £25 one-off: ${this.config.lifetimeBuyUrl}\n\n` +
               `After purchase you'll receive an unlock code by download — enter it below.`;
    }

    activateLicense(rawCode) {
        const code = (rawCode || '').trim();

        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            return { success: false, message: 'Code must be exactly 6 digits.' };
        }

        if (code === this.config.annualCode) {
            this.storeLicense('ANNUAL', code);
            return {
                success: true,
                type: 'ANNUAL',
                message: '🎉 Annual licence activated! Enjoy a full year of ' + this.config.appName + '.'
            };
        }

        if (code === this.config.lifetimeCode) {
            this.storeLicense('LIFETIME', code);
            return {
                success: true,
                type: 'LIFETIME',
                message: '🎉 Lifetime licence activated! Thank you for supporting ' + this.config.appName + '.'
            };
        }

        return { success: false, message: "That code isn't recognised. Please check it and try again." };
    }

    storeLicense(type, code) {
        const licenseData = {
            type,
            code,
            activatedAt: Date.now(),
            activatedDate: new Date().toISOString()
        };
        localStorage.setItem(this.storageKey, JSON.stringify(licenseData));
        console.log(`🔒 License activated: ${type}`);
    }

    getLicenseData() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error reading license data:', error);
            return null;
        }
    }

    clearLicense() {
        localStorage.removeItem(this.storageKey);
        console.log('🧹 License cleared');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LicenseManager, LICENSE_CONFIG };
} else if (typeof window !== 'undefined') {
    window.LicenseManager = LicenseManager;
    window.LICENSE_CONFIG = LICENSE_CONFIG;
}
