export const APP_URL = "app-url";
const CLIENT_KEY = "client-key";
const NODE_URL = "node_url";

export const getAppEndpointKey = (): string | null => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      let storageRecord: string | null = localStorage.getItem(APP_URL);
      if (storageRecord) {
        let url: string = JSON.parse(storageRecord);
        if (url && url.length > 0) {
          return url;
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const setAppEndpointKey = (url: string) => {
  localStorage.setItem(APP_URL, JSON.stringify(url));
};

export const getClientKey = (): String => {
  return localStorage.getItem(CLIENT_KEY) ?? "";
};

export const setNodeUrlFromQuery = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const nodeUrl = urlParams.get(NODE_URL);
  if (nodeUrl) {
    setAppEndpointKey(nodeUrl);
    const newUrl = `${window.location.pathname}auth`;
    window.location.href = newUrl;
  }
};
