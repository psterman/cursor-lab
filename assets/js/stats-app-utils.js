/**
 * stats-app-utils.js - Utility Functions Module
 * Contains standalone utility functions
 * Wrapped in IIFE to avoid global namespace pollution
 */
(function() {
    'use strict';

    // Skip if already loaded
    if (window.__UtilsModuleLoaded) {
        console.log('[Utils Module] Already loaded, skipping...');
        return;
    }
    window.__UtilsModuleLoaded = true;

    // ============================================================
    // Standalone Utility Functions
    // ============================================================

    /**
     * HTML escape - prevents XSS
     * @param {string} s - String to escape
     * @returns {string} Escaped string
     */
    function _escapeHtml(s) {
        if (s === null || s === undefined) return '';
        const str = String(s);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    window._escapeHtml = _escapeHtml;

    /**
     * Format number with locale-specific separators
     * @param {number} num - Number to format
     * @returns {string} Formatted number
     */
    window.formatNumber = function(num) {
        if (num === null || num === undefined) return '0';
        const n = Number(num);
        if (isNaN(n)) return '0';
        return n.toLocaleString('en-US');
    };

    /**
     * Clamp a number between min and max
     * @param {number} n - Number to clamp
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Clamped number
     */
    window.clamp = function(n, min, max) {
        const x = Number(n);
        if (isNaN(x)) return min;
        return Math.max(min, Math.min(max, x));
    };

    /**
     * Convert number to percentage string
     * @param {number} n - Number (0-100)
     * @returns {string} Percentage string
     */
    window.pct = function(n) {
        const x = window.clamp(n, 0, 100);
        return `${x.toFixed(1)}%`;
    };

    /**
     * Convert country code to flag emoji (e.g., CN -> 🇨🇳)
     * @param {string} code - Country code
     * @returns {string} Flag emoji
     */
    window.countryCodeToFlagEmoji = function(code) {
        if (!code || typeof code !== 'string') return '';
        const s = code.toUpperCase().trim();
        if (s.length !== 2) return '';
        const a = s.charCodeAt(0), b = s.charCodeAt(1);
        if (a < 65 || a > 90 || b < 65 || b > 90) return '';
        return String.fromCodePoint(0x1F1E6 + a - 65, 0x1F1E6 + b - 65);
    };

    /**
     * Get flag emoji with fallback
     * @param {string} code - Country code
     * @returns {string} Flag emoji or neutral flag
     */
    window.getFlagEmoji = function(code) {
        if (!code || code === 'UN' || code === null || code === '') {
            return '🏳️';
        }
        
        const codeStr = String(code).toUpperCase().trim();
        if (codeStr.length < 2) {
            return '🏳️';
        }
        
        try {
            const codePoints = [...codeStr].map(char => char.charCodeAt(0) + 127397);
            return String.fromCodePoint(...codePoints);
        } catch (e) {
            return '🏳️';
        }
    };

    /**
     * Convert hex color to rgba
     * @param {string} hex - Hex color code
     * @param {number} alpha - Alpha value (0-1)
     * @returns {string} RGBA color string
     */
    window._hexToRgba = function(hex, alpha) {
        if (!hex) return `rgba(0, 0, 0, ${alpha})`;
        // Remove # if present
        hex = hex.replace(/^#/, '');
        
        // Parse hex value
        let r, g, b;
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else {
            return `rgba(0, 0, 0, ${alpha})`;
        }
        
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    /**
     * Check if string contains Chinese characters
     * @param {string} s - String to check
     * @returns {boolean} True if contains Chinese
     */
    window._hasZh = function(s) {
        return /[\u4e00-\u9fff]/.test(String(s || ''));
    };

    /**
     * Extract Chinese n-grams from text
     * @param {string} sentence - Text to extract from
     * @param {number} minN - Minimum n-gram length
     * @param {number} maxN - Maximum n-gram length
     * @returns {Array} Array of n-grams
     */
    window._extractChineseNgrams = function(sentence, minN = 3, maxN = 10) {
        if (!sentence || typeof sentence !== 'string') return [];
        const text = sentence.trim();
        if (text.length < minN) return [];
        
        const results = [];
        for (let len = minN; len <= Math.min(maxN, text.length); len++) {
            for (let i = 0; i <= text.length - len; i++) {
                const ngram = text.substring(i, i + len);
                results.push(ngram);
            }
        }
        return results;
    };

    /**
     * Extract English word n-grams from text
     * @param {string} sentence - Text to extract from
     * @param {number} minN - Minimum n-gram length
     * @param {number} maxN - Maximum n-gram length
     * @returns {Array} Array of n-grams
     */
    window._extractEnglishWordNgrams = function(sentence, minN = 3, maxN = 7) {
        if (!sentence || typeof sentence !== 'string') return [];
        const words = sentence.toLowerCase().trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length < minN) return [];
        
        const results = [];
        for (let len = minN; len <= Math.min(maxN, words.length); len++) {
            for (let i = 0; i <= words.length - len; i++) {
                const ngram = words.slice(i, i + len).join(' ');
                results.push(ngram);
            }
        }
        return results;
    };

    /**
     * Normalize string for comparison
     * @param {string} s - String to normalize
     * @returns {string} Normalized string
     */
    window._normForCompare = function(s) {
        return String(s || '').trim().replace(/\s+/g, '').toLowerCase();
    };

    /**
     * Check if two strings are within levenshtein distance
     * @param {string} a - First string
     * @param {string} b - Second string
     * @param {number} maxDistance - Maximum allowed distance
     * @returns {boolean} True if within distance
     */
    window._levenshteinWithin = function(a, b, maxDistance = 1) {
        if (!a || !b) return false;
        a = String(a).toLowerCase().trim();
        b = String(b).toLowerCase().trim();
        
        if (Math.abs(a.length - b.length) > maxDistance) return false;
        
        // Simple DP approach for levenshtein distance
        const m = a.length;
        const n = b.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i-1] === b[j-1]) {
                    dp[i][j] = dp[i-1][j-1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
                }
            }
        }
        
        return dp[m][n] <= maxDistance;
    };

    console.log('[Utils Module] ✅ Loaded successfully');

})();
