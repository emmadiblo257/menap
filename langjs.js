/**
 * LangJS v2.0 - Advanced language manager for your Webpage
 * Developed by Emmadiblo
 * No dependencies required (Vanilla JS)
 */

class LangJS {
    constructor(config = {}) {
        this.config = {
            languagePath: config.languagePath || './lang/',
            defaultLanguage: config.defaultLanguage || 'en',
            persistKey: config.persistKey || 'langjs_language',
            fallbackLanguage: config.fallbackLanguage || 'en',
            detectBrowser: config.detectBrowser !== false,
            attributes: config.attributes || ['translate', 'data-translate'],
            placeholderAttribute: config.placeholderAttribute || 'translate-placeholder',
            titleAttribute: config.titleAttribute || 'translate-title',
            autoInit: config.autoInit !== false,
            onLanguageChange: config.onLanguageChange || null,
            debug: config.debug || false
        };

        this.currentLanguage = null;
        this.languageDict = {};
        this.availableLanguages = config.availableLanguages || ['en', 'fr'];
        this.observers = [];
        this.translationCache = new Map();

        if (this.config.autoInit) {
            this.init();
        }
    }

    /**
     * Initialize the language system
     */
    async init() {
        const detectedLang = this.detectLanguage();
        await this.setLanguage(detectedLang);
        this.observeDOMChanges();
        this.log(`LangJS initialized with language: ${this.currentLanguage}`);
    }

    /**
     * Detect language from browser or saved preference
     */
    detectLanguage() {
        // 1. Check saved preference
        const savedLang = this.getStoredLanguage();
        if (savedLang && this.availableLanguages.includes(savedLang)) {
            return savedLang;
        }

        // 2. Check browser language
        if (this.config.detectBrowser) {
            const browserLang = (navigator.language || navigator.userLanguage).toLowerCase();
            for (const lang of this.availableLanguages) {
                if (browserLang.startsWith(lang)) {
                    return lang;
                }
            }
        }

        // 3. Fallback to default
        return this.config.defaultLanguage;
    }

    /**
     * Load and set a new language
     */
    async setLanguage(lang) {
        if (!this.availableLanguages.includes(lang)) {
            this.log(`Language "${lang}" not available. Using fallback.`, 'warn');
            lang = this.config.fallbackLanguage;
        }

        try {
            const response = await fetch(`${this.config.languagePath}${lang}.json`);
            if (!response.ok) throw new Error(`Could not load language file: ${lang}.json`);
            this.languageDict = await response.json();
            this.currentLanguage = lang;
            this.translationCache.clear();

            // Save preference
            this.saveLanguage(lang);

            // Update DOM
            this.translatePage();

            // Update html lang attribute
            document.documentElement.lang = lang;

            // Trigger callback
            if (this.config.onLanguageChange) {
                this.config.onLanguageChange(lang);
            }

            this.log(`Language set to: ${lang}`);
            return true;
        } catch (error) {
            this.log(`Failed to load language "${lang}": ${error.message}`, 'error');

            // Try fallback if not already trying fallback
            if (lang !== this.config.fallbackLanguage) {
                return this.setLanguage(this.config.fallbackLanguage);
            }
            return false;
        }
    }

    /**
     * Load language JSON file
     */
    async loadLanguageFile(lang) {
        const url = `${this.config.languagePath}${lang}.json`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Translate the entire page
     */
    translatePage() {
        // Translate text content
        this.config.attributes.forEach(attr => {
            document.querySelectorAll(`[${attr}]`).forEach(el => {
                const key = el.getAttribute(attr);
                if (key) {
                    const translation = this.get(key);
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        el.value = translation;
                    } else {
                        el.textContent = translation;
                    }
                }
            });
        });

        // Translate placeholders
        document.querySelectorAll(`[${this.config.placeholderAttribute}]`).forEach(el => {
            const key = el.getAttribute(this.config.placeholderAttribute);
            if (key) {
                el.placeholder = this.get(key);
            }
        });

        // Translate titles (tooltips)
        document.querySelectorAll(`[${this.config.titleAttribute}]`).forEach(el => {
            const key = el.getAttribute(this.config.titleAttribute);
            if (key) {
                el.title = this.get(key);
            }
        });

        // Translate aria-label
        document.querySelectorAll('[translate-aria]').forEach(el => {
            const key = el.getAttribute('translate-aria');
            if (key) {
                el.setAttribute('aria-label', this.get(key));
            }
        });
    }

    /**
     * Get translation for a specific key (supports nested keys with dot notation)
     */
    get(key, params = {}) {
        // Check cache
        const cacheKey = `${key}_${JSON.stringify(params)}`;
        if (this.translationCache.has(cacheKey)) {
            return this.translationCache.get(cacheKey);
        }

        let value = this.languageDict;
        const keys = key.split('.');

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                this.log(`Translation key not found: ${key}`, 'warn');
                value = key; // Return key as fallback
                break;
            }
        }

        // Replace parameters
        if (typeof value === 'string' && Object.keys(params).length > 0) {
            value = this.interpolate(value, params);
        }

        // Cache result
        this.translationCache.set(cacheKey, value);
        return value;
    }

    /**
     * Interpolate parameters in translation string
     * Example: "Hello {name}" with {name: "John"} => "Hello John"
     */
    interpolate(text, params) {
        return text.replace(/\{(\w+)\}/g, (match, key) => {
            return params.hasOwnProperty(key) ? params[key] : match;
        });
    }

    /**
     * Get current language
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Get available languages
     */
    getAvailableLanguages() {
        return [...this.availableLanguages];
    }

    /**
     * Check if a language is available
     */
    isLanguageAvailable(lang) {
        return this.availableLanguages.includes(lang);
    }

    /**
     * Save language preference
     */
    saveLanguage(lang) {
        try {
            localStorage.setItem(this.config.persistKey, lang);
        } catch (e) {
            this.log('Could not save language preference', 'warn');
        }
    }

    /**
     * Get stored language preference
     */
    getStoredLanguage() {
        try {
            return localStorage.getItem(this.config.persistKey);
        } catch (e) {
            return null;
        }
    }

    /**
     * Observe DOM changes to translate dynamically added content
     */
    observeDOMChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        this.translateElement(node);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.observers.push(observer);
    }

    /**
     * Translate a specific element and its children
     */
    translateElement(element) {
        // Translate the element itself
        this.config.attributes.forEach(attr => {
            if (element.hasAttribute && element.hasAttribute(attr)) {
                const key = element.getAttribute(attr);
                if (key) {
                    element.textContent = this.get(key);
                }
            }
        });

        // Translate children
        if (element.querySelectorAll) {
            this.config.attributes.forEach(attr => {
                element.querySelectorAll(`[${attr}]`).forEach(el => {
                    const key = el.getAttribute(attr);
                    if (key) {
                        el.textContent = this.get(key);
                    }
                });
            });
        }
    }

    /**
     * Format number according to current language
     */
    formatNumber(number, options = {}) {
        return new Intl.NumberFormat(this.currentLanguage, options).format(number);
    }

    /**
     * Format date according to current language
     */
    formatDate(date, options = {}) {
        return new Intl.DateTimeFormat(this.currentLanguage, options).format(date);
    }

    /**
     * Format currency according to current language
     */
    formatCurrency(amount, currency = 'USD', options = {}) {
        return new Intl.NumberFormat(this.currentLanguage, {
            style: 'currency',
            currency: currency,
            ...options
        }).format(amount);
    }

    /**
     * Get language direction (ltr/rtl)
     */
    getLanguageDirection() {
        const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
        return rtlLanguages.includes(this.currentLanguage) ? 'rtl' : 'ltr';
    }

    /**
     * Apply direction to document
     */
    applyDirection() {
        document.documentElement.dir = this.getLanguageDirection();
    }

    /**
     * Destroy instance and cleanup
     */
    destroy() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
        this.translationCache.clear();
        this.log('LangJS instance destroyed');
    }

    /**
     * Debug logging
     */
    log(message, type = 'log') {
        if (this.config.debug) {
            console[type](`[LangJS] ${message}`);
        }
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LangJS;
}
if (typeof window !== 'undefined') {
    window.LangJS = LangJS;
}