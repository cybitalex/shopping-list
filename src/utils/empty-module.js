// This is a placeholder module for Playwright
// It provides empty exports to prevent bundling errors
export default {};
export const chromium = {
  launch: () => Promise.resolve({
    newContext: () => Promise.resolve({
      newPage: () => Promise.resolve({})
    }),
    close: () => Promise.resolve()
  })
}; 