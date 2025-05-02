// Listen for when the DOM content is fully loaded to ensure elements are available
document.addEventListener('DOMContentLoaded', () => {
  // Query Chrome tabs to get the currently active tab in the current window
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const currentTabId = currentTab.id;

    // Load previously stored product match for this tab from Chrome's local storage
    chrome.storage.local.get(`bestMatchProduct_${currentTabId}`, (result) => {
      updatePopup(result[`bestMatchProduct_${currentTabId}`]);
    });

    // Set up listener for incoming messages from other parts of the extension
    chrome.runtime.onMessage.addListener((message) => {
      // Update popup if we receive a new best match product
      if (message.type === 'bestMatchProduct') {
        updatePopup(message.data);
      }
    });

    /**
     * Updates the popup UI based on whether a product match was found
     * @param {Object|null} product - The matched product object or null if no match
     */
    function updatePopup(product) {
      // Get references to UI elements
      const matchFoundEl = document.getElementById('matchFound');
      const noMatchEl = document.getElementById('noMatch');
      const retryBtn = document.getElementById('retryButton');
    
      if (product) {
        // Show matched product section and hide no-match message
        matchFoundEl.style.display = 'block';
        noMatchEl.style.display = 'none';
    
        // Populate product data into DOM elements
        document.getElementById('productName').textContent = product.name;
        document.getElementById('productType').textContent = product.type;
        document.getElementById('productPrice').textContent = `$${product.price.toFixed(2)}`;
        
        // Handle discount display logic:
        // - Show "HEAVY DISCOUNT" for special cases
        // - Regular discount formatting
        // - Fallback to "AVAILABLE" if no discount
        document.getElementById('productDiscount').textContent = 
          product.discount >= 100000 ? 'HEAVY DISCOUNT!!!' :
          (product.discount ? 
            `Save: $${product.discount} (${product.discountPercentage}%)` : 
            'AVAILABLE');
            
        document.getElementById('productImage').src = product.imageUrl;
        
        // Set up click handler for view button to open product page
        document.getElementById('viewButton').onclick = () => {
          chrome.tabs.create({ url: `https://baxus.co/asset/${product.id}` });
        };
      } else {
        // Show no-match message and hide product section
        matchFoundEl.style.display = 'none';
        noMatchEl.style.display = 'block';
    
        // Set up retry button to reload page and close popup
        retryBtn.onclick = () => {
          chrome.tabs.reload();  // Refresh current tab
          window.close();         // Close extension popup
        };
      }
    }
  });
});