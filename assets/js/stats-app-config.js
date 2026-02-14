/**
 * stats-app-config.js - Configuration Module
 * Contains API endpoints, Supabase config, and utility helpers
 * Exposed to window for use by main app
 */
(function() {
    'use strict';

    // Skip if already loaded
    if (window.__ConfigModuleLoaded) {
        console.log('[Config Module] Already loaded, skipping...');
        return;
    }
    window.__ConfigModuleLoaded = true;

    // ============================================================
    // Supabase Configuration
    // ============================================================
    
    window.SUPABASE_URL = 'https://dtcplfhcgnxdzpigmotb.supabase.co';
    window.SUPABASE_KEY = 'sb_publishable_-rrlujgXDNxqb-UsMJckNw_G2rn2e8x';

    // ============================================================
    // API Endpoint Helper
    // ============================================================
    
    /**
     * Get API endpoint from meta tag
     * @returns {string} API endpoint with trailing slash
     */
    window.getApiEndpoint = function() {
        var apiEndpoint = (document.querySelector('meta[name="api-endpoint"]')?.content || '').trim();
        return apiEndpoint.endsWith('/') ? apiEndpoint : apiEndpoint + '/';
    };

    /**
     * Get Supabase auth token
     * @returns {Promise<string|null>} Auth token
     */
    window.getSupabaseAuthToken = async function() {
        try {
            if (window.supabaseClient && typeof window.supabaseClient.auth.getSession === 'function') {
                var session = await window.supabaseClient.auth.getSession();
                return session?.data?.session?.access_token || null;
            }
        } catch (e) {
            console.warn('[Config] Failed to get Supabase token:', e);
        }
        return null;
    };

    /**
     * Get current fingerprint
     * @returns {string} User fingerprint
     */
    window.getFingerprint = function() {
        try {
            return localStorage.getItem('user_fingerprint') || window.fpId || '';
        } catch (e) {
            return '';
        }
    };

    /**
     * Get GitHub username from storage
     * @returns {string} GitHub username
     */
    window.getGitHubUsername = function() {
        try {
            return localStorage.getItem('github_username') || '';
        } catch (e) {
            return '';
        }
    };

    /**
     * Get current language setting
     * @returns {string} 'zh' or 'en'
     */
    window.getCurrentLang = function() {
        var lang = 'zh';
        try {
            var savedLang = localStorage.getItem('lang') || localStorage.getItem('appLanguage') || 'zh';
            savedLang = String(savedLang).trim().toLowerCase();
            if (savedLang === 'en' || savedLang.startsWith('en')) {
                lang = 'en';
            } else if (savedLang === 'zh' || savedLang.startsWith('zh')) {
                lang = 'zh';
            }
        } catch (e) {
            lang = 'zh';
        }
        return lang;
    };

    // ============================================================
    // Cache Helpers
    // ============================================================
    
    /**
     * Initialize a cache map on window if not exists
     * @param {string} name - Cache name
     * @returns {Map} Cache map
     */
    window.initCache = function(name) {
        var cacheName = '__' + name + 'Cache';
        if (!window[cacheName]) {
            window[cacheName] = new Map();
        }
        return window[cacheName];
    };

    /**
     * Get from cache with TTL
     * @param {string} cacheName - Cache name
     * @param {string} key - Cache key
     * @param {number} ttlMs - Time to live in ms
     * @returns {any|null} Cached value or null
     */
    window.getFromCache = function(cacheName, key, ttlMs) {
        var cache = window['__' + cacheName + 'Cache'];
        if (!cache) return null;
        
        var entry = cache.get(key);
        if (!entry) return null;
        
        if (ttlMs && Date.now() - entry.ts > ttlMs) {
            cache.delete(key);
            return null;
        }
        
        return entry.data;
    };

    /**
     * Set cache value
     * @param {string} cacheName - Cache name
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     */
    window.setCache = function(cacheName, key, data) {
        var cache = window.initCache(cacheName);
        cache.set(key, { data: data, ts: Date.now() });
    };

    /**
     * Clear all caches
     */
    window.clearAllCaches = function() {
        try {
            if (window.__countryDashboardCache) window.__countryDashboardCache.clear();
            if (window.__countrySummaryCache) window.__countrySummaryCache.clear();
            if (window.__countryTotalsCache) window.__countryTotalsCache.clear();
            console.log('[Config] All caches cleared');
        } catch (e) {
            console.warn('[Config] Failed to clear caches:', e);
        }
    };

    // ============================================================
    // Debug Helpers
    // ============================================================
    
    /**
     * Check if debug mode is enabled
     * @param {string} key - Debug key
     * @returns {boolean} Debug enabled
     */
    window.isDebugEnabled = function(key) {
        try {
            var qs = new URLSearchParams(window.location.search || '');
            if (qs.get('debug') === '1' || qs.get('debug')?.toLowerCase() === 'true') return true;
            return localStorage.getItem('debug_' + key) === '1';
        } catch (e) {
            return false;
        }
    };

    /**
     * Set debug mode
     * @param {string} key - Debug key
     * @param {boolean} enabled - Enabled state
     */
    window.setDebugEnabled = function(key, enabled) {
        try {
            localStorage.setItem('debug_' + key, enabled ? '1' : '0');
        } catch (e) {
            console.warn('[Config] Failed to set debug:', e);
        }
    };

    console.log('[Config Module] ✅ Loaded successfully');

})();
