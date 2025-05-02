// background.js

// --- STRING SIMILARITY LIBRARY ---
const stringSimilarity = (() => {
  /**
   * Compares two strings using bigram comparison method
   * @param {string} first - First string to compare
   * @param {string} second - Second string to compare
   * @returns {number} Similarity score between 0 and 1
   */
  function compareTwoStrings(first, second) {
    // Normalize strings by removing whitespace
    first = first.replace(/\s+/g, "");
    second = second.replace(/\s+/g, "");
    if (first === second) return 1;
    if (first.length < 2 || second.length < 2) return 0;

    // Create bigram frequency map
    let pairs = new Map();
    for (let i = 0; i < first.length - 1; i++) {
      const pair = first.substring(i, i + 2);
      pairs.set(pair, (pairs.get(pair) || 0) + 1);
    }

    // Calculate intersection count
    let intersection = 0;
    for (let i = 0; i < second.length - 1; i++) {
      const pair = second.substring(i, i + 2);
      const count = pairs.get(pair) || 0;
      if (count > 0) {
        pairs.set(pair, count - 1);
        intersection++;
      }
    }

    // Return similarity score
    return (2.0 * intersection) / (first.length + second.length - 2);
  }

  return { compareTwoStrings };
})();

// --- CURRENCY HANDLING UTILITIES ---

/**
 * Standardizes currency information from price string
 * @param {string} priceStr - Raw price string
 * @param {string} currency - Detected currency symbol
 * @returns {Object} Normalized currency data {currency: string, amount: number}
 */
function detectCurrency(priceStr, currency) {
  const cleaned = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
  switch (currency) {
    case '$': case 'USD': return { currency: 'USD', amount: cleaned };
    case '€': case 'EUR': return { currency: 'EUR', amount: cleaned };
    case '£': case 'GBP': return { currency: 'GBP', amount: cleaned };
    case '¥': case 'JPY': return { currency: 'JPY', amount: cleaned };
    case '₹': case 'INR': return { currency: 'INR', amount: cleaned };
    case '₽': case 'RUB': return { currency: 'RUB', amount: cleaned };
    case '₩': case 'KRW': return { currency: 'KRW', amount: cleaned };
    case '₪': case 'ILS': return { currency: 'ILS', amount: cleaned };
    case '元': case 'CNY': return { currency: 'CNY', amount: cleaned };
    case 'BRL': return { currency: 'BRL', amount: cleaned };
    default: return { currency: 'UNKNOWN', amount: cleaned };
  }
}

/**
 * Converts currency to USD using external API
 * @param {number} amount - Original amount
 * @param {string} currency - Source currency code
 * @returns {Promise<number|null>} Converted USD amount
 */
async function convertToUSD(amount, currency) {
  if (currency === 'USD') return amount;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=USD`);
    const data = await res.json();
    return amount * data.rates.USD;
  } catch (err) {
    console.error("Currency conversion failed:", err);
    return null;
  }
}

// --- DATA MANAGEMENT ---
let tabProducts = {}; // Stores products per tab ID

// --- MESSAGE HANDLING ---
chrome.runtime.onMessage.addListener(async (request, sender) => {
  // Handle incoming product data from content scripts
  if (request.type === 'productData' && request.data) {
    const product = request.data;
    const tabId = sender.tab?.id;
    if (!tabId) return;

    // Initialize tab storage if needed
    if (!tabProducts[tabId]) tabProducts[tabId] = [];

    // Process currency information
    const cleaned = detectCurrency(product.price, product.currency);
    const converted = await convertToUSD(cleaned.amount, cleaned.currency);
    
    // Update product record
    product.price = converted;
    product.timestamp = new Date().toISOString();

    // Store and notify
    tabProducts[tabId].push(product);
    chrome.storage.local.set({ tabProducts });

    // Show desktop notification
    if (product.name && product.price) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'Product Scraped',
        message: `${product.name} - $${product.price.toFixed(2)}`
      });
    }

    // Start comparison process
    fetchAndCompareWithBaxus(product, tabId);
  }
});

// --- BAXUS INTEGRATION ---

/**
 * Fetches Baxus product listings and initiates comparison
 * @param {Object} scrapedProduct - Scraped product data
 * @param {number} tabId - Source tab ID
 */
function fetchAndCompareWithBaxus(scrapedProduct, tabId) {
  fetch('https://services.baxus.co/api/search/listings?from=0&size=20&listed=true')
    .then(res => res.json())
    .then(result => {
      // Normalize Baxus product data
      const baxusProducts = (result || []).map(item => ({
        name: item._source?.name,
        type: item._source?.type,
        price: item._source?.price,
        id: item._id,
        imageUrl: item._source?.imageUrl,
      }));

      compareProducts(scrapedProduct, baxusProducts, tabId);
    })
    .catch(err => console.error('Baxus API error:', err));
}

// --- PRODUCT COMPARISON LOGIC ---

/**
 * Compares scraped product with Baxus listings using similarity matching
 * @param {Object} scrapedProduct - Scraped product data
 * @param {Array} baxusProducts - List of Baxus products
 * @param {number} tabId - Source tab ID
 */
function compareProducts(scrapedProduct, baxusProducts, tabId) {
  // Clean product name for comparison
  const removeWords = ["Buy", "buy", "BUY", "Sell", "sell", "Buy/Sell", 
                      "BUY/SELL", "SELL", "750ml", '-', 'online', 
                      "Online", "/", "lot", "Lot"];

  removeWords.forEach(word => {
    // Remove numeric noise
    scrapedProduct.name = scrapedProduct.name.replace(/\b\d+\b/g, match => 
      (match.length === 1 || match.length === 2 || match.length === 4) ? match : ''
    );
    
    // Clean up whitespace
    scrapedProduct.name = scrapedProduct.name.replace(/\s+/g, ' ').trim();

    // Remove target words
    const escapedWord = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    scrapedProduct.name = scrapedProduct.name.replace(
      new RegExp(escapedWord, 'gi'), 
      ''
    );
  });

  // Find best match using similarity scoring
  let bestMatch = null;
  let highestScore = 0;

  baxusProducts.forEach(product => {
    const score = stringSimilarity.compareTwoStrings(
      scrapedProduct.name,
      product.name
    );
    
    if (score > highestScore) {
      highestScore = score;
      bestMatch = product;
    }
  });

  // Handle match results
  if (bestMatch && highestScore >= 0.45) {
    // Calculate discount information
    const discount = scrapedProduct.price - bestMatch.price;
    bestMatch.discount = discount > 0 ? discount.toFixed(2) : null;
    bestMatch.discountPercentage = discount > 0 ? 
      ((discount / scrapedProduct.price) * 100).toFixed(2) : 
      null;

    // Update storage and UI
    chrome.storage.local.set({ [`bestMatchProduct_${tabId}`]: bestMatch });
    chrome.runtime.sendMessage({
      type: 'bestMatchProduct',
      data: bestMatch
    });
  } else {
    // Clear existing matches
    chrome.storage.local.remove(`bestMatchProduct_${tabId}`);
    chrome.runtime.sendMessage({
      type: 'bestMatchProduct',
      data: null
    });
  }
}

// --- TAB DATA MANAGEMENT ---

/**
 * Clears stored data for a specific tab
 * @param {number} tabId - Target tab ID
 */
function clearDataForTab(tabId) {
  tabProducts[tabId] = [];
  chrome.storage.local.set({ tabProducts });
}

// Handle clear data requests
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'clearData' && request.tabId) {
    clearDataForTab(request.tabId);
  }
});