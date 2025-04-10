let isGoogleMapsLoaded = false;
let loadPromise: Promise<void> | null = null;

export const loadGoogleMaps = (apiKey: string): Promise<void> => {
  if (isGoogleMapsLoaded) {
    return Promise.resolve();
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    // Check if script already exists
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existingScript) {
      if (window.google && window.google.maps) {
        isGoogleMapsLoaded = true;
        resolve();
        return;
      }
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      isGoogleMapsLoaded = true;
      resolve();
    };

    script.onerror = () => {
      reject(new Error("Failed to load Google Maps"));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
};

export const getGoogleMapsService = (): typeof google.maps => {
  if (!isGoogleMapsLoaded || !window.google || !window.google.maps) {
    throw new Error("Google Maps is not loaded yet");
  }
  return window.google.maps;
};
