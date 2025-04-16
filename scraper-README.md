# Google Shopping Scraper

A web scraper that extracts product information from Google Shopping search results.

## Features

- Searches for products on Google Shopping by name and location
- Extracts product names, prices, store names, and distances
- Groups products by store
- Sorts results by distance and price
- Handles various Google Shopping layouts and formats
- Takes screenshots of search results for reference and debugging
- Supports batch searching multiple products across multiple stores

## Usage

Basic usage:

```bash
# Search for a product nearby
node run-scraper.js "apples"

# Search for a product at a specific store
node run-scraper.js "apples" "Harris Teeter"

# Search for a product in a specific location
node run-scraper.js "apples" "Charlotte NC"

# Batch search multiple products across multiple stores
node run-batch-scraper.js "apples,milk,eggs" "Walmart,Target,Harris Teeter"
```

## Output

The script returns results in two formats:

1. A user-friendly console output grouped by store
2. A complete JSON object containing all extracted data

Example console output:

```
Found 10 products from 1 stores.

--- Products by Store ---

Harris Teeter (2 mi away)
----------------------------------------
Our Family Apples Pink Lady Apples - $1.61
Apple Product - $2.00
Kroger Gala Apples 3 Pound Bag - $5.49
Cosmic Crisp Premium Apples - $6.99
Harris Teeter Applesauce Unsweetened 23 oz - $2.89
```

Example JSON output (truncated):

```json
{
  "success": true,
  "stores": [
    {
      "name": "Harris Teeter",
      "distance": 2,
      "items": [
        {
          "name": "Our Family Apples Pink Lady Apples",
          "price": "$1.61",
          "method": "standard-.MUWJ8c"
        },
        ...
      ]
    }
  ],
  "products": [
    {
      "name": "Our Family Apples Pink Lady Apples",
      "price": "$1.61",
      "store": "Harris Teeter",
      "distance": 2,
      "method": "standard-.MUWJ8c",
      "priceValue": 1.61,
      "distanceText": "2 mi"
    },
    ...
  ],
  "totalStores": 1,
  "totalProducts": 10
}
```

## Batch Scraper

The batch scraper allows you to search for multiple products across multiple stores in a single command. It:

- Processes searches with controlled concurrency
- Provides a summary of results per product and store
- Saves complete results to a JSON file for further analysis
- Takes a screenshot of each search result for reference

Example batch search output:

```
=== Batch Search Summary ===

APPLES
  nearby: 40 products from 18 stores
  Harris Teeter: 10 products from 1 stores
  Walmart: 21 products from 5 stores

MILK
  nearby: 40 products from 12 stores
  Harris Teeter: 40 products from 2 stores
  Walmart: 32 products from 3 stores
```

## Requirements

- Node.js 16+
- Playwright

## Installation

1. Install dependencies:

```bash
npm install
```

2. Install Playwright browsers:

```bash
npm run install-browsers
```

## How It Works

The scraper uses Playwright to:

1. Open a headless browser and navigate to Google Shopping
2. Enter the search term and location
3. Wait for results to load
4. Extract product information using multiple selector strategies
5. Process and clean up the data
6. Return the results in a structured format

A screenshot of each search result is saved to help with debugging and understanding the data extraction process.

## Limitations

- Google Shopping's layout and selectors may change, requiring updates to the extraction logic
- Some product names may be extracted as "Apple Product" when the name can't be accurately determined
- Discount information is extracted but may not always be accurate
- The scraper is designed for educational purposes and should be used responsibly

## License

MIT 