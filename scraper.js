import { chromium } from "playwright";
import fs from "fs/promises";

async function scrapeGoogleShopping(item, options = {}) {
  // Convert old string parameter format to new options format for backward compatibility
  let locationHint = "";
  let latitude, longitude;

  if (typeof options === "string") {
    locationHint = options;
  } else if (typeof options === "object") {
    locationHint = options.locationHint || "";
    latitude = options.latitude;
    longitude = options.longitude;
  }

  console.log(`Searching for ${item} using Playwright`);
  if (locationHint) console.log(`Location hint: ${locationHint}`);
  if (latitude && longitude)
    console.log(`Coordinates: ${latitude}, ${longitude}`);

  try {
    // Initialize browser with basic settings
    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });

    // Enable console logging for debugging
    context.on("console", (msg) => {
      console.log(`Browser console: ${msg.type()}: ${msg.text()}`);
    });

    const page = await context.newPage();

    // Set geolocation if coordinates are provided
    if (latitude && longitude) {
      await context.setGeolocation({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: 100,
      });
      console.log(`Set geolocation to: ${latitude}, ${longitude}`);

      // Also grant permissions for geolocation
      await context.grantPermissions(["geolocation"]);
    }

    // Navigate to Google Shopping
    console.log("Navigating to Google Shopping...");
    await page.goto("https://www.google.com/shopping", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for the search box
    console.log("Waiting for search box...");
    const searchBox = await page
      .waitForSelector('input[name="q"], textarea[name="q"]', {
        timeout: 10000,
      })
      .catch((e) => {
        console.log(`Error waiting for search box: ${e.message}`);
        return null;
      });

    if (!searchBox) {
      throw new Error("Search box not found");
    }

    // Build search query - be careful not to duplicate "nearby" if it's already in locationHint
    let searchQuery;

    // Check if the item already contains "price" or "nearby"
    const hasPrice = item.toLowerCase().includes("price");
    const hasNearby =
      item.toLowerCase().includes("nearby") ||
      (locationHint && locationHint.toLowerCase().includes("nearby"));

    // Build the query intelligently
    if (hasPrice && hasNearby) {
      // If it already has both price and nearby, just use as is
      searchQuery = item;
    } else if (hasPrice) {
      // If it has price but no nearby
      searchQuery =
        latitude && longitude
          ? `${item} near me`
          : `${item} ${locationHint || "nearby"}`;
    } else if (hasNearby) {
      // If it has nearby but no price
      searchQuery = `${item} price`;
    } else {
      // If it has neither price nor nearby
      searchQuery =
        latitude && longitude
          ? `${item} price near me`
          : `${item} price ${locationHint || "nearby"}`;
    }

    // Execute search
    console.log(`Typing search query: "${searchQuery}"`);
    await searchBox.fill(searchQuery);

    // Print current URL before search
    console.log(`Pre-search URL: ${page.url()}`);

    console.log("Submitting search...");
    await searchBox.press("Enter");

    // Wait for results to load
    console.log("Waiting for navigation after search...");
    await page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 })
      .catch((e) => console.log(`Navigation wait timed out: ${e.message}`));

    // Print current URL after search
    console.log(`Post-search URL: ${page.url()}`);
    console.log(`Page title: ${await page.title()}`);

    // Give extra time for content to load
    await page.waitForTimeout(10000);

    // Take screenshot for reference
    const screenshotPath = `google-shopping-${item.replace(/\s+/g, "-")}-${
      locationHint ? locationHint.replace(/\s+/g, "-") : "nearby"
    }.png`;
    console.log(`Taking screenshot: ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath });

    // Log page structure to debug
    console.log("Logging page structure:");
    const pageStructure = await page.evaluate(() => {
      function getNodePath(element, maxDepth = 3, currentDepth = 0) {
        if (!element || currentDepth > maxDepth) return "";

        let nodeName = element.nodeName.toLowerCase();
        const id = element.id ? `#${element.id}` : "";
        const classes = Array.from(element.classList || [])
          .map((c) => `.${c}`)
          .join("");

        return `${nodeName}${id}${classes}`;
      }

      function traverseDOM(element, depth = 0, maxDepth = 3) {
        if (!element || depth > maxDepth) return "";

        const nodePath = getNodePath(element, 0, 0);
        let result = "  ".repeat(depth) + nodePath;

        if (element.nodeType === 1) {
          // Element node
          if (
            element.textContent &&
            element.textContent.trim() &&
            element.children.length === 0
          ) {
            const text = element.textContent.trim().replace(/\s+/g, " ");
            if (text.length > 50) {
              result += `: "${text.substring(0, 47)}..."`;
            } else if (text.length > 0) {
              result += `: "${text}"`;
            }
          }

          result += "\n";

          for (const child of element.children) {
            result += traverseDOM(child, depth + 1, maxDepth);
          }
        }

        return result;
      }

      return traverseDOM(document.body, 0, 2);
    });

    console.log(pageStructure);

    // Extract products using multiple selector approaches
    const products = await page.evaluate(
      ({ searchedItem, storeFilter }) => {
        console.log("Starting product extraction");
        const results = [];

        // Helper functions
        const cleanPrice = (text) => {
          if (!text) return null;
          const match = text.match(/\$(\d+\.\d{1,2}|\d+)/);
          return match ? match[0] : null;
        };

        const extractDistance = (text) => {
          if (!text) return null;
          const match =
            text.match(/(\d+(\.\d+)?)\s*mi away/i) ||
            text.match(/Nearby,\s+(\d+(\.\d+)?)\s*mi/i) ||
            text.match(/(\d+(\.\d+)?)\s*mi/i);
          return match ? parseFloat(match[1]) : null;
        };

        const extractTextContent = (element) => {
          if (!element) return null;
          return element.textContent.trim().replace(/\s+/g, " ");
        };

        // Improved function to check if text is a UI element rather than product info
        function isUIElement(text) {
          if (!text) return true;
          if (text.length < 3) return true;

          const uiTerms = [
            "search",
            "results",
            "refine",
            "sort",
            "filter",
            "view",
            "all",
            "more",
            "less",
            "price",
            "rating",
            "map",
            "ads",
            "sponsored",
            "shopping",
            "directions",
            "website",
            "home",
            "search results",
            "accessibility links",
            "menu",
            "about this result",
            "about these results",
          ];

          const lowerText = text.toLowerCase().trim();
          return uiTerms.some(
            (term) =>
              lowerText === term ||
              lowerText.startsWith(term + " ") ||
              lowerText.endsWith(" " + term) ||
              lowerText.includes(" " + term + " ")
          );
        }

        function findProductPrice(container) {
          // Specific price selectors
          const priceSelectors = [
            '[aria-label*="price"]',
            "[data-price]",
            "span[aria-label]",
            "span.a8Pemb",
            "span.YdtKid", // Known Google Shopping price class
            ".EE56Ke", // Known price container
          ];

          // Try each selector
          for (const selector of priceSelectors) {
            const element = container.querySelector(selector);
            if (element && /\$\d+(\.\d{1,2})?/.test(element.textContent)) {
              return cleanPrice(element.textContent);
            }
          }

          // Fallback: Look for any element with $ format
          const priceEls = Array.from(container.querySelectorAll("*")).filter(
            (el) => /\$\d+(\.\d{1,2})?/.test(el.textContent)
          );

          if (priceEls.length > 0) {
            return cleanPrice(priceEls[0].textContent);
          }

          return null;
        }

        function findProductName(container, priceElement) {
          // Specific name selectors
          const nameSelectors = [
            "h3",
            '[role="heading"]',
            'a[href*="shopping/product"]',
            ".EI11Pd", // Known product name class
            ".sh-np__product-title", // Product title
            ".Xjkr3b", // Another product name class
            ".BvQan", // Another name container
            ".fObmGc", // Known product name container
          ];

          // Try each selector
          for (const selector of nameSelectors) {
            const element = container.querySelector(selector);
            if (
              element &&
              element !== priceElement &&
              !isUIElement(element.textContent)
            ) {
              const name = extractTextContent(element);
              if (
                name &&
                name.length > 3 &&
                !name.includes("Nearby,") &&
                !name.includes("Also nearby")
              ) {
                return name;
              }
            }
          }

          // Fallback: Try to find any text element that might be a product name
          const textEls = Array.from(container.querySelectorAll("*")).filter(
            (el) =>
              el !== priceElement &&
              el.textContent?.trim().length > 5 &&
              !el.textContent.includes("$") &&
              !el.textContent.includes("Nearby,") &&
              !el.textContent.includes("Also nearby") &&
              !isUIElement(el.textContent)
          );

          if (textEls.length > 0) {
            return extractTextContent(textEls[0]);
          }

          return "Unknown Product";
        }

        function findStoreName(container, priceElement, nameElement) {
          // Specific store selectors
          const storeSelectors = [
            '[aria-label*="from"]',
            ".b5LS6",
            'span[dir="ltr"]',
            ".E5ocAb", // Store container
            ".aULzUe", // Known store name class
            ".BXIkFb", // Merchant name
          ];

          // Try each selector
          for (const selector of storeSelectors) {
            const element = container.querySelector(selector);
            if (
              element &&
              element !== priceElement &&
              element !== nameElement &&
              !element.textContent.includes("$") &&
              !element.textContent.includes(" mi") &&
              !element.textContent.includes("Nearby,") &&
              !element.textContent.includes("Free delivery") &&
              !element.textContent.includes("returns") &&
              !element.textContent.includes("Get it by") &&
              !isUIElement(element.textContent)
            ) {
              const store = extractTextContent(element);
              if (store && store.length > 2) {
                return store;
              }
            }
          }

          // Check if there's text that looks like a store
          const storeTextRegexes = [
            /from\s+([^,]+)/i,
            /at\s+([^,]+)/i,
            /by\s+([^,]+)/i,
          ];

          for (const regex of storeTextRegexes) {
            const allText = container.textContent;
            const match = allText.match(regex);
            if (match && match[1] && match[1].length > 2) {
              return match[1].trim();
            }
          }

          // Fallback: Look for any element that's not price, name, or distance
          const potentialStoreEls = Array.from(
            container.querySelectorAll("*")
          ).filter(
            (el) =>
              el !== priceElement &&
              el !== nameElement &&
              el.textContent?.trim().length > 2 &&
              !el.textContent.includes("$") &&
              !el.textContent.includes(" mi") &&
              !el.textContent.includes("Nearby,") &&
              !el.textContent.includes("Also nearby") &&
              !el.textContent.includes("Free delivery") &&
              !el.textContent.includes("returns") &&
              !el.textContent.includes("Get it by") &&
              !isUIElement(el.textContent)
          );

          if (potentialStoreEls.length > 0) {
            // Sort by length to get the most likely store name (not too long, not too short)
            potentialStoreEls.sort((a, b) => {
              const textA = a.textContent.trim();
              const textB = b.textContent.trim();
              // Ideal length for store names is usually between 5-25 characters
              const scoreA = Math.abs(textA.length - 15);
              const scoreB = Math.abs(textB.length - 15);
              return scoreA - scoreB;
            });

            return extractTextContent(potentialStoreEls[0]);
          }

          return null;
        }

        function findDistance(container) {
          // Extract distance from "Nearby, X mi" pattern
          const nearbyMatch = container.textContent.match(
            /Nearby,\s+(\d+(\.\d+)?)\s*mi/i
          );
          if (nearbyMatch) {
            return parseFloat(nearbyMatch[1]);
          }

          // Specific distance selectors
          const distanceSelectors = [
            '[aria-label*="miles"]',
            '[aria-label*="mi away"]',
            ".BOo5Bd", // Known distance class
          ];

          // Try each selector
          for (const selector of distanceSelectors) {
            const element = container.querySelector(selector);
            if (element && /\d+(\.\d+)?\s*mi/.test(element.textContent)) {
              return extractDistance(element.textContent);
            }
          }

          // Fallback: Look for any text containing "mi" (miles)
          const distanceEls = Array.from(
            container.querySelectorAll("*")
          ).filter((el) => /\d+(\.\d+)?\s*mi/.test(el.textContent));

          if (distanceEls.length > 0) {
            return extractDistance(distanceEls[0].textContent);
          }

          return null;
        }

        function isValidStoreName(name) {
          if (!name) return false;

          // Invalid store names
          const invalidNames = [
            "report",
            "violation",
            "other",
            "about",
            "search",
            "feedback",
            "help",
            "support",
            "contact",
            "menu",
            "navigation",
            "skip",
            "main",
            "content",
            "header",
            "footer",
            "sidebar",
            "cart",
            "checkout",
            "account",
            "apple",
            "gala",
            "cosmic",
            "crisp",
            "fresh", // Common apple varieties that might be mistaken for stores
            "organic",
            "conventional",
            "premium",
            "select", // Common product descriptors
            "product",
            "item",
            "results",
            "price",
            "sale", // Generic terms
          ];

          const lowerName = name.toLowerCase();

          // Check if it contains any invalid terms
          if (invalidNames.some((term) => lowerName.includes(term))) {
            return false;
          }

          // Check if it's too long to be a store name
          if (name.length > 50) return false;

          // Check if it's mostly numbers (like a phone number)
          if (name.replace(/[^0-9]/g, "").length > name.length / 2)
            return false;

          // Must contain at least one letter
          if (!/[a-zA-Z]/.test(name)) return false;

          // Known store chains (partial list)
          const knownStores = [
            "walmart",
            "target",
            "kroger",
            "publix",
            "costco",
            "sams",
            "whole foods",
            "trader",
            "food lion",
            "harris teeter",
            "aldi",
            "lidl",
            "giant",
            "safeway",
            "wegmans",
            "shoprite",
            "stop & shop",
            "meijer",
          ];

          // Bonus points if it matches a known store chain
          if (knownStores.some((store) => lowerName.includes(store))) {
            return true;
          }

          // Additional validation for unknown store names
          // Must be between 3 and 30 characters
          if (name.length < 3 || name.length > 30) return false;

          // Shouldn't contain product-related words
          const productWords = [
            "lb",
            "oz",
            "pack",
            "bag",
            "box",
            "count",
            "ct",
            "fresh",
          ];
          if (productWords.some((word) => lowerName.includes(word)))
            return false;

          return true;
        }

        function isReasonablePrice(price, itemName) {
          if (!price) return false;

          // Extract numeric value
          const value = parseFloat(price.replace(/[^\d.]/g, ""));
          if (isNaN(value)) return false;

          // More specific limits for common items
          const itemLimits = {
            apple: { min: 0.25, max: 10 },
            apples: { min: 0.25, max: 10 },
            banana: { min: 0.1, max: 8 },
            bananas: { min: 0.1, max: 8 },
            milk: { min: 1, max: 12 },
            bread: { min: 1, max: 15 },
            eggs: { min: 1, max: 12 },
            meat: { min: 2, max: 30 },
            chicken: { min: 2, max: 25 },
            fish: { min: 3, max: 40 },
          };

          const lowerItem = itemName.toLowerCase();
          const limits = itemLimits[lowerItem];

          if (limits) {
            return value >= limits.min && value <= limits.max;
          }

          // General price limits for other grocery items
          const MIN_PRICE = 0.1; // 10 cents minimum
          const MAX_PRICE = 50; // $50 maximum for most grocery items

          return value >= MIN_PRICE && value <= MAX_PRICE;
        }

        // Add this function before the product processing
        function normalizeStoreName(name) {
          if (!name) return null;

          // Common store name variations to normalize
          const storeVariations = {
            walmart: [
              "walmart supercenter",
              "walmart neighborhood market",
              "walmart grocery",
            ],
            target: ["target store", "super target"],
            kroger: ["kroger marketplace", "kroger grocery"],
            publix: ["publix super market", "publix grocery"],
            costco: ["costco wholesale", "costco warehouse"],
            sams: ["sam's club", "sams club"],
            wholefds: ["whole foods", "whole foods market"],
            traderjoes: ["trader joe's", "trader joes"],
            foodlion: ["food lion"],
            harristeeter: ["harris teeter"],
            aldi: ["aldi market", "aldi grocery"],
            dollargeneral: ["dollar general"],
            familydollar: ["family dollar"],
          };

          const normalizedName = name.toLowerCase().trim();

          // Check each store variation
          for (const [baseStore, variations] of Object.entries(
            storeVariations
          )) {
            if (variations.some((v) => normalizedName.includes(v))) {
              // Capitalize first letter of each word in original name
              return name
                .split(" ")
                .map(
                  (word) =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                )
                .join(" ");
            }
          }

          // If no match found, just capitalize first letter of each word
          return name
            .split(" ")
            .map(
              (word) =>
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            )
            .join(" ");
        }

        // Product card selectors
        const productSelectors = [
          ".sh-dgr__grid-result", // Grid view results
          ".sh-dlr__list-result", // List view results
          "div.KZmu8e", // Common result container
          ".MUWJ8c", // Another product container
          ".sh-dla__hover-container", // Mobile results sometimes
          "div[data-item-id]", // Items with explicit IDs
          "c-wiz[data-node-index] > div > div:not([jscontroller])", // Generic structure for products
        ];

        // Count of price elements for debugging
        const allPriceElements = document.querySelectorAll("*");
        let priceElementCount = 0;
        allPriceElements.forEach((el) => {
          if (/\$\d+(\.\d{1,2})?/.test(el.textContent)) {
            priceElementCount++;
          }
        });
        console.log(`Found ${priceElementCount} elements with price text`);

        // Try each selector to find product cards
        let totalProcessedCards = 0;

        for (const selector of productSelectors) {
          const productCards = document.querySelectorAll(selector);

          if (productCards.length > 0) {
            console.log(
              `Found ${productCards.length} potential products with selector ${selector}`
            );

            productCards.forEach((card) => {
              try {
                // Skip tiny elements (probably UI components)
                if (card.offsetWidth < 100 || card.offsetHeight < 50) {
                  console.log("Skipping small element");
                  return;
                }

                totalProcessedCards++;

                // Get price first as it's the most reliable indicator of a product
                const price = findProductPrice(card);
                if (!price) {
                  console.log("No price found, skipping");
                  return;
                }

                // Get name using the price element as a reference
                const name = findProductName(card, price);

                // Get store name using price and name elements as references
                const store = findStoreName(card, price, name);

                // Get distance
                const distance = findDistance(card);

                // Only add if we have the essential information
                if (name && price) {
                  // Skip if it's clearly a UI element
                  if (isUIElement(name)) {
                    console.log(`Skipping UI element: ${name}`);
                    return;
                  }

                  // Filter by store if specified
                  if (
                    storeFilter &&
                    store &&
                    !store.toLowerCase().includes(storeFilter.toLowerCase())
                  ) {
                    console.log(`Skipping non-matching store: ${store}`);
                    return;
                  }

                  results.push({
                    name,
                    price,
                    store,
                    distance: distance !== null ? distance : null,
                    method: `standard-${selector}`,
                  });
                }
              } catch (error) {
                console.error("Error extracting product info:", error);
              }
            });

            // If we found at least some valid products, stop trying other selectors
            if (results.length > 0) {
              break;
            }
          }
        }

        console.log(`Processed ${totalProcessedCards} total product cards`);

        // If no results found with standard selectors, try a more aggressive approach
        if (results.length === 0) {
          console.log(
            "No products found with standard selectors, trying fallback method"
          );

          // Find all containers that might be product cards
          const potentialContainers = Array.from(
            document.querySelectorAll("div")
          ).filter((div) => {
            // Size filtering: product cards are usually reasonable size
            if (div.offsetWidth < 150 || div.offsetHeight < 100) return false;

            // Content filtering: Should have price and reasonable content
            const hasPrice = /\$\d+(\.\d{1,2})?/.test(div.textContent);
            const hasTextContent = div.textContent.trim().length > 20;
            const notTooMuchContent = div.textContent.trim().length < 500; // Avoid huge containers

            return hasPrice && hasTextContent && notTooMuchContent;
          });

          console.log(
            `Found ${potentialContainers.length} potential product containers`
          );

          for (const container of potentialContainers) {
            try {
              const price = findProductPrice(container);
              if (!price) continue;

              const name = findProductName(container, price);
              if (!name || isUIElement(name)) continue;

              const store = findStoreName(container, price, name);
              const distance = findDistance(container);

              results.push({
                name,
                price,
                store,
                distance: distance !== null ? distance : null,
                method: "aggressive-fallback",
              });
            } catch (error) {
              console.error("Error in fallback extraction:", error);
            }
          }
        }

        // Final fallback if still no products found
        if (results.length === 0) {
          console.log(
            "Still no products found, trying final fallback with just price elements"
          );

          // Find all elements with price format
          const priceElements = Array.from(
            document.querySelectorAll("*")
          ).filter((el) =>
            /\$\d+(\.\d{1,2})?/.test(el.textContent?.trim() || "")
          );

          // For each price, try to work outward to find a product container
          priceElements.forEach((priceEl) => {
            try {
              const price = cleanPrice(priceEl.textContent);
              if (!price) return;

              // Look for product name near this price
              let container = priceEl.parentElement;
              let depth = 0;
              const maxDepth = 4; // Go up more levels

              // Go up a few levels to find a container
              while (container && depth < maxDepth) {
                // Skip if container is too small
                if (
                  container.offsetWidth < 100 ||
                  container.offsetHeight < 50
                ) {
                  container = container.parentElement;
                  depth++;
                  continue;
                }

                const name = findProductName(container, priceEl);
                if (name && !isUIElement(name)) {
                  const store = findStoreName(container, priceEl, null);
                  const distance = findDistance(container);

                  results.push({
                    name,
                    price,
                    store,
                    distance: distance !== null ? distance : null,
                    method: "price-based-fallback",
                  });

                  break; // Found what we need, stop going up the DOM
                }

                container = container.parentElement;
                depth++;
              }
            } catch (error) {
              console.error("Error in price-based fallback:", error);
            }
          });
        }

        console.log(`Final result count: ${results.length}`);

        // Process the products before returning
        results.forEach((product) => {
          // Skip invalid store names
          if (!isValidStoreName(product.store)) {
            product.store = null;
          }

          // Normalize store name
          if (product.store) {
            product.store = normalizeStoreName(product.store);
          }

          // Skip if normalization failed
          if (!product.store) {
            product.shouldRemove = true;
            return;
          }

          // Skip unreasonable prices
          if (!isReasonablePrice(product.price, searchedItem)) {
            product.shouldRemove = true;
            return;
          }

          // Fix product names
          if (
            product.name &&
            (product.name.includes("Nearby,") ||
              product.name.includes("Also nearby") ||
              product.name.toLowerCase().includes("about this result") ||
              product.name.toLowerCase().includes("about these results"))
          ) {
            // This data is not useful and doesn't appear on Google Shopping results
            product.shouldRemove = true;
            return;
          }

          // Check if the name is too generic (just the search term or a slight variation)
          if (
            product.name.toLowerCase().trim() ===
              searchedItem.toLowerCase().trim() ||
            product.name.toLowerCase().trim() ===
              searchedItem.toLowerCase().trim() + "s"
          ) {
            // Mark generic names for better UI display
            product.isGenericName = true;
          }

          // Remove discount percentages that are included in the name
          if (product.name && /^\d+%\s*OFF/.test(product.name)) {
            // Keep the discount info but mark for removal if we can't get the right product name
            product.discount = product.name.match(/^\d+%/)[0];
            product.shouldRemove = true;
            return;
          }

          // Fix store names
          if (product.store) {
            // Clean up store names with patterns like "2.3(152)" which are likely rating information
            if (/^\d+\.\d+\(\d+.*\)$/.test(product.store)) {
              product.rating = product.store;
              product.store = null;
              product.shouldRemove = true;
              return;
            }

            // Clean up store names with delivery dates
            if (/^Apr \d+/.test(product.store)) {
              product.deliveryInfo = product.store;
              product.store = null;
              product.shouldRemove = true;
              return;
            }

            // Check if store name is also a product name, which indicates likely incorrect extraction
            if (product.store === product.name) {
              // This is likely incorrect - mark for removal
              product.shouldRemove = true;
              return;
            }

            // Handle return policy info in store name
            if (
              product.store.includes("returns") ||
              product.store.includes("Get it by") ||
              product.store.includes("delivery")
            ) {
              product.returnPolicy = product.store;
              product.store = null;
              product.shouldRemove = true;
              return;
            }
          }

          // Fix prices - ensure they're formatted correctly
          if (product.price) {
            // Make sure price starts with $
            if (!product.price.startsWith("$")) {
              product.price = "$" + product.price;
            }

            // Try to convert the price to a number for sorting
            try {
              product.priceValue = parseFloat(
                product.price.replace(/[^\d.]/g, "")
              );
            } catch (e) {
              product.priceValue = 0;
              product.shouldRemove = true;
              return;
            }
          } else {
            product.shouldRemove = true;
            return;
          }

          // Add formatted distance
          if (product.distance !== null && product.distance !== undefined) {
            product.distanceText = `${product.distance} mi`;
          }
        });

        // Filter out products that should be removed
        const filteredResults = results.filter(
          (product) => !product.shouldRemove
        );
        console.log(
          `Filtered ${results.length - filteredResults.length} invalid products`
        );

        return filteredResults;
      },
      {
        searchedItem: item,
        storeFilter: locationHint ? locationHint.toLowerCase() : null,
      }
    );

    console.log(`Found ${products.length} products after filtering`);

    // Sort products by store and distance before grouping
    products.sort((a, b) => {
      // First sort by store name if available
      if (a.store && b.store) {
        if (a.store !== b.store) {
          return a.store.localeCompare(b.store);
        }
      } else if (a.store) {
        return -1;
      } else if (b.store) {
        return 1;
      }

      // Then by distance if available
      const distA = a.distance !== null ? a.distance : Infinity;
      const distB = b.distance !== null ? b.distance : Infinity;

      if (distA !== distB) return distA - distB;

      // Then by price
      const priceA = a.priceValue || Infinity;
      const priceB = b.priceValue || Infinity;

      return priceA - priceB;
    });

    // Group by store
    const productsByStore = {};
    products.forEach((product) => {
      // Skip products with missing required data
      if (!product.name || !product.price || !product.store) return;

      const storeKey = product.store;
      if (!productsByStore[storeKey]) {
        productsByStore[storeKey] = [];
      }
      productsByStore[storeKey].push(product);
    });

    // Close browser
    await browser.close();

    if (Object.keys(productsByStore).length === 0) {
      return {
        success: false,
        error: "No matching products found",
      };
    }

    // Format the response
    return {
      success: true,
      stores: Object.keys(productsByStore).map((storeName) => ({
        name: storeName,
        distance: productsByStore[storeName][0].distance,
        items: productsByStore[storeName].map((product) => ({
          name: product.name,
          price: product.price,
          method: product.method,
          isGenericName: product.isGenericName || false,
          productDetail: product.productDetail || null,
        })),
      })),
      products: products,
      totalStores: Object.keys(productsByStore).length,
      totalProducts: products.length,
    };
  } catch (error) {
    console.error(`Error in web scraping: ${error.message}`);
    console.error(error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
}

export { scrapeGoogleShopping };

// Run the function if called directly
if (import.meta.url === import.meta.main) {
  const item = process.argv[2] || "apples";
  const locationHint = process.argv[3] || "";

  scrapeGoogleShopping(item, locationHint)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => console.error("Error:", err));
}
