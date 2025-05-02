// content.js

// --- PRICE EXTRACTION UTILITIES ---



/**
 * Extracts price information from a DOM element
 * @param {HTMLElement} element - DOM element containing price information
 * @returns {Object} Price data object with currency, amount, original text, and display format
 */
function extractPriceFromElement(element) {
  const fullText = element.textContent.trim();

  // Handle plain number formats without currency symbols
  if (/^\d[\d,.]*$/.test(fullText)) {
    const currency = detectCurrencyFromContext(element);
    return {
      currency,
      amount: parseFloat(fullText.replace(/,/g, '')),
      original: fullText,
      display: `${currency}${fullText}`
    };
  }

  // Regex pattern to match common price formats
  const priceRegex = /([$€£¥₹₽₩₪元R\$])\s*([\d.,]+)|([\d.,]+)\s*([$€£¥₹₽₩₪元R\$])/i;
  const match = fullText.match(priceRegex);

  let currency, amount;

  if (match) {
    // Extract currency and amount from regex matches
    currency = match[1] || match[4] || '';
    amount = match[2] || match[3] || '';
  } else {
    // Fallback to context detection if no direct match
    currency = detectCurrencyFromContext(element);
    amount = fullText;
  }

  // Handle different decimal/thousand separator formats
  if (/\.\d{3},\d{2}$/.test(amount)) {
    amount = amount.replace(/\./g, '').replace(',', '.');
  } else if (/,\d{3}\.\d{2}$/.test(amount)) {
    amount = amount.replace(/,/g, '');
  } else if (/,/.test(amount)) {
    amount = /,\d{2}$/.test(amount) ? amount.replace(',', '.') : amount.replace(/,/g, '');
  }

  // Clean remaining non-numeric characters
  amount = amount.replace(/[^\d.]/g, '');

  return {
    currency: currency.trim(),
    amount: parseFloat(amount),
    original: fullText,
    display: `${currency.trim()}${amount}`
  };
}

/**
 * Validates if a price string meets format requirements
 * @param {string} priceString - Input price string to validate
 * @returns {boolean} True if valid price format
 */
function isValidPrice(priceString) {
  if (!priceString) return false;
  const cleanPrice = priceString.replace(/,|\s/g, '');
  const priceRegex = /^(\$|€|£|¥|₹|₽|₩|₪|元|R\$|USD|EUR|GBP|JPY|CNY)?\d+(\.\d{1,2})?$|^\d+(\.\d{1,2})?\s*(\$|€|£|¥|₹|₽|₩|₪|元|R\$|USD|EUR|GBP|JPY|CNY)$/i;

  if (priceRegex.test(cleanPrice)) {
    const numericValue = parseFloat(cleanPrice.replace(/[^\d.]/g, ''));
    return numericValue > 0.01 && numericValue < 10000000;
  }
  return false;
}

/**
 * Detects currency from context elements in the DOM
 * @param {HTMLElement} element - Starting element for context search
 * @returns {string} Detected currency symbol
 */
function detectCurrencyFromContext(element) {
  // List of common price-containing selectors
  const context = element.closest([
    '.ll-price',
    '.price',
    '.product-price',
    '.amount',
    '.value',
    '.price__amount',
    '.price-value',
    '.product__price',
    '[data-testid="price"]',
    '[data-price]'
  ].join(','))?.textContent || '';

  // Match first occurring currency symbol
  const currencyMatch = context.match(/(\$|€|£|¥|₹|₽|₩|₪|元|R\$|Rs\.?|AED)/);
  return currencyMatch?.[0] || '$'; // Default to USD if no match
}

// --- SMART PRICE DETECTOR (REPLACES BRUTE FORCE) ---

/**
 * Scans visible elements to detect price information
 * @returns {Object|null} Price data object or null if not found
 */
function priceDetector() {
  // Filter visible elements containing currency symbols
  const elements = Array.from(document.querySelectorAll('body *')).filter(el => {
    const style = window.getComputedStyle(el);
    const text = el.textContent?.trim();
    return (
      el.children.length === 0 &&
      text &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      /[$€£¥₹₽₩₪元R\$]/.test(text)
    );
  });
  
  // Check filtered elements for valid prices
  for (const el of elements) {
    const data = extractPriceFromElement(el);
    if (data && isValidPrice(data.display)) {
      return data;
    }
  }
  
  return null;
}

// --- CORE PRODUCT EXTRACTION ---

/**
 * Main product information extraction function
 * @returns {Object|null} Product data object or null if incomplete
 */
function extractProductInfo() {
  const result = {
    name: null,
    price: null,
    currency: null,
    url: window.location.href
  };
  
  // 1. Schema.org structured data parsing
  try {
    const scriptTags = document.querySelectorAll('script[type="application/ld+json"]');
    for (const tag of scriptTags) {
      try {
        const data = JSON.parse(tag.textContent.trim());
        const products = Array.isArray(data) ? data : [data];
        for (const item of products) {
          if (item['@type'] === 'Product' || item['@type']?.includes('Product')) {
            result.name = item.name || result.name;
            if (item.offers) {
              result.price = item.offers.price || result.price;
              result.currency = item.offers.priceCurrency || result.currency;
            } else if (item.price) {
              result.price = item.price;
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
  
  // 2. Direct price element detection
  if (!result.price) {
    const priceSelectors = [
      '.ll-price',
      '.price',
      '.product-price',
      '.amount',
      '.value',
      '.price__amount',
      '.price-value',
      '.product__price',
      '[data-testid="price"]',
      '[data-price]'
    ];
  
    for (const selector of priceSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const priceData = extractPriceFromElement(element);
        if (priceData && isValidPrice(priceData.display)) {
          result.price = priceData.display;
          result.currency = priceData.currency;
          break;
        }
      }
      if (result.price) break;
    }
  }

  // 3. Dynamic price detection fallback
  if (!result.price && !result.currency) {
    const data = priceDetector();
    if (data) {
      result.price = data.display;
      result.currency = data.currency;
    }
  }

  // 4. Product name detection
  if (!result.name) {
    result.name = document.querySelector('meta[property="og:title"]')?.content ||
                  document.querySelector('meta[name="title"]')?.content;
  }

  if (!result.name) {
    const nameSelectors = [
      '[itemprop="name"]',
      '.product-name',
      '.product-title',
      '.product__title',
      '.product-detail__title',
      '.product-heading',
      '.productName',
      '.product-name-container',
      'h1:not(.header):not(.site-header):not(.logo)',
      'h2.product',
      '[data-testid="product-title"]',
      '[data-product-name]',
      '[data-name]'
    ];
    
    for (const selector of nameSelectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        result.name = element.textContent.trim();
        break;
      }
    }
  }

  // Final validation
  if (result.price && !isValidPrice(result.price)) {
    result.price = null;
    result.currency = null;
  }

  return result.name && result.price ? result : null;
}

// --- DATA TRANSMISSION ---

const scrapedProduct = extractProductInfo();
if (scrapedProduct) {
  // Send validated product data to background script
  chrome.runtime.sendMessage({
    type: 'productData',
    data: scrapedProduct
  });
}