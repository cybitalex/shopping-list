const { getJson } = require("serpapi");

async function testSerpApi() {
  try {
    const params = {
      engine: "google_shopping",
      api_key:
        "c54c47bdbf6dbe1eef970a76495dee22009aafee9b2af718100155a7f14d4f59",
      google_domain: "google.com",
      q: "apples near me",
      hl: "en",
      gl: "us",
      device: "desktop",
      ll: "35.12815617287287,-79.02820543598727",
    };

    console.log("Making SerpAPI request with params:", params);

    const response = await getJson("google_shopping", params);

    console.log("Raw SerpAPI response:");
    console.log(JSON.stringify(response, null, 2));

    if (response.shopping_results) {
      console.log(
        `\nFound ${response.shopping_results.length} shopping results`
      );
      response.shopping_results.slice(0, 5).forEach((result, index) => {
        console.log(`\nResult ${index + 1}:`);
        console.log(`  Title: ${result.title}`);
        console.log(`  Price: ${result.price}`);
        console.log(`  Source: ${result.source}`);
        console.log(`  Extensions: ${JSON.stringify(result.extensions)}`);
      });
    } else {
      console.log("No shopping_results in response");
    }
  } catch (error) {
    console.error("Error testing SerpAPI:", error);
  }
}

testSerpApi();
