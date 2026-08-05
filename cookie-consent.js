/**
 * Cookie Consent Banner for Google AdSense Compliance
 * Compliant with GDPR, ePrivacy Directive, and Google AdSense requirements
 */

(function() {
  'use strict';

  const CONSENT_KEY = 'pdfbox_cookie_consent';
  const CONSENT_EXPIRY_DAYS = 365;

  // Check if user has already given consent
  function hasConsent() {
    return localStorage.getItem(CONSENT_KEY) !== null;
  }

  // Get stored consent preferences
  function getConsent() {
    const stored = localStorage.getItem(CONSENT_KEY);
    return stored ? JSON.parse(stored) : null;
  }

  // Save consent preferences
  function saveConsent(preferences) {
    const data = {
      timestamp: new Date().toISOString(),
      preferences: preferences
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(data));

    // Trigger consent update for AdSense
    if (window.gtag) {
      gtag('consent', 'update', {
        'ad_storage': preferences.advertising ? 'granted' : 'denied',
        'analytics_storage': preferences.analytics ? 'granted' : 'denied',
        'ad_user_data': preferences.advertising ? 'granted' : 'denied',
        'ad_personalization': preferences.advertising ? 'granted' : 'denied'
      });
    }
  }

  // Create and show the consent banner
  function showBanner() {
    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.innerHTML = `
      <div class="cookie-consent-content">
        <div class="cookie-consent-text">
          <p><strong>We value your privacy</strong></p>
          <p>We use cookies to enhance your experience and show relevant ads via Google AdSense.
          You can accept all cookies or manage your preferences. Your files are always processed locally and never uploaded to our servers.</p>
        </div>
        <div class="cookie-consent-buttons">
          <button id="cookie-reject" class="cookie-btn cookie-btn-secondary">Reject Non-Essential</button>
          <button id="cookie-customize" class="cookie-btn cookie-btn-secondary">Manage Options</button>
          <button id="cookie-accept" class="cookie-btn cookie-btn-primary">Accept All</button>
        </div>
      </div>
      <div id="cookie-options" class="cookie-options" style="display: none;">
        <div class="cookie-option">
          <label>
            <input type="checkbox" id="cookie-essential" checked disabled>
            <span><strong>Essential Cookies</strong> (Required for basic site functionality)</span>
          </label>
        </div>
        <div class="cookie-option">
          <label>
            <input type="checkbox" id="cookie-advertising">
            <span><strong>Advertising Cookies</strong> (Used to show relevant ads via Google AdSense)</span>
          </label>
        </div>
        <div class="cookie-option">
          <label>
            <input type="checkbox" id="cookie-analytics">
            <span><strong>Analytics Cookies</strong> (Help us understand how visitors use the site)</span>
          </label>
        </div>
        <div class="cookie-options-buttons">
          <button id="cookie-save-preferences" class="cookie-btn cookie-btn-primary">Save Preferences</button>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #cookie-consent-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #1a1a2e;
        color: #ffffff;
        padding: 20px;
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .cookie-consent-content {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }
      .cookie-consent-text {
        flex: 1;
        min-width: 300px;
      }
      .cookie-consent-text p {
        margin: 0 0 8px 0;
        font-size: 14px;
        line-height: 1.6;
      }
      .cookie-consent-text p:last-child {
        margin-bottom: 0;
      }
      .cookie-consent-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .cookie-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      .cookie-btn-primary {
        background: #4361ee;
        color: #ffffff;
      }
      .cookie-btn-primary:hover {
        background: #3a56d4;
      }
      .cookie-btn-secondary {
        background: transparent;
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.3);
      }
      .cookie-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.5);
      }
      .cookie-options {
        max-width: 1200px;
        margin: 20px auto 0;
        padding-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.2);
      }
      .cookie-option {
        margin-bottom: 15px;
      }
      .cookie-option label {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        cursor: pointer;
        font-size: 14px;
      }
      .cookie-option input[type="checkbox"] {
        margin-top: 3px;
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
      .cookie-options-buttons {
        margin-top: 20px;
      }
      @media (max-width: 768px) {
        .cookie-consent-content {
          flex-direction: column;
          align-items: stretch;
        }
        .cookie-consent-buttons {
          justify-content: stretch;
        }
        .cookie-btn {
          flex: 1;
          text-align: center;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(banner);

    // Event listeners
    document.getElementById('cookie-accept').addEventListener('click', function() {
      saveConsent({ essential: true, advertising: true, analytics: true });
      removeBanner();
    });

    document.getElementById('cookie-reject').addEventListener('click', function() {
      saveConsent({ essential: true, advertising: false, analytics: false });
      removeBanner();
    });

    document.getElementById('cookie-customize').addEventListener('click', function() {
      const options = document.getElementById('cookie-options');
      options.style.display = options.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('cookie-save-preferences').addEventListener('click', function() {
      const advertising = document.getElementById('cookie-advertising').checked;
      const analytics = document.getElementById('cookie-analytics').checked;
      saveConsent({ essential: true, advertising, analytics });
      removeBanner();
    });
  }

  // Remove the banner
  function removeBanner() {
    const banner = document.getElementById('cookie-consent-banner');
    if (banner) {
      banner.style.transition = 'opacity 0.3s ease';
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 300);
    }
  }

  // Initialize
  if (!hasConsent()) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  } else {
    // Apply previously saved consent
    const consent = getConsent();
    if (consent && window.gtag) {
      gtag('consent', 'update', {
        'ad_storage': consent.preferences.advertising ? 'granted' : 'denied',
        'analytics_storage': consent.preferences.analytics ? 'granted' : 'denied',
        'ad_user_data': consent.preferences.advertising ? 'granted' : 'denied',
        'ad_personalization': consent.preferences.advertising ? 'granted' : 'denied'
      });
    }
  }

  // Make functions available globally for privacy policy page
  window.PDFBoxCookieConsent = {
    hasConsent,
    getConsent,
    saveConsent,
    showBanner
  };
})();