import { getNodeUrl } from "./node";

export const getAppEndpointKey = (): String | null => {
  return getNodeUrl();
};
