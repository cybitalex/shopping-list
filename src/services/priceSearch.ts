import { chromium } from 'playwright';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface PriceSearchResult {
  price: number;
  productName: string;
  source: string;
  store: string;
  url: string;
  isEstimate?: boolean;
  distance?: string;
}

let browser: any = null;

export const searchPrices = async (item: string, store: string, location: string): Promise<PriceSearchResult | null> => {
  try {
    if (!browser) {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });
    }

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    const page = await context.newPage();

    // Navigate to Google Shopping
    await page.goto('https://www.google.com/shopping', { waitUntil: 'networkidle' });
    
    // Enter search query
    await page.fill('input[name="q"]', `${item} ${store} ${location}`);
    await page.press('input[name="q"]', 'Enter');
    
    // Wait for results with increased timeout
    await page.waitForSelector('.sh-dgr__content', { timeout: 30000 });
    
    // Extract price information
    const priceElement = await page.$('.g9WBQb');
    const productNameElement = await page.$('.tAxDx');
    const storeElement = await page.$('.aULzUe');
    const urlElement = await page.$('.shntl a');
    
    if (!priceElement || !productNameElement || !storeElement) {
      return null;
    }

    const price = await priceElement.textContent();
    const productName = await productNameElement.textContent();
    const storeName = await storeElement.textContent();
    const url = await urlElement?.getAttribute('href');

    // Use OpenAI to verify and enhance the price information
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that verifies and enhances product price information."
        },
        {
          role: "user",
          content: `Verify this price information: Product: ${productName}, Price: ${price}, Store: ${storeName}. Is this accurate?`
        }
      ],
      model: "gpt-4",
    });

    const verification = completion.choices[0].message.content;
    const isEstimate = verification?.toLowerCase().includes('estimate') || false;

    await context.close();

    return {
      price: parseFloat(price?.replace(/[^0-9.]/g, '') || '0'),
      productName: productName || '',
      source: 'google_shopping',
      store: storeName || '',
      url: url || '',
      isEstimate,
      distance: '0.5 miles' // This would be calculated based on actual location data
    };
  } catch (error) {
    console.error('Error searching prices:', error);
    return null;
  }
};

// Cleanup function to close the browser when the application shuts down
export const cleanup = async () => {
  if (browser) {
    await browser.close();
    browser = null;
  }
}; 