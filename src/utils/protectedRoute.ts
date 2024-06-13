
const BASE_PATH = "/admin-dashboard";

export const getPathname = () => {
    return location.pathname.startsWith(BASE_PATH)
    ? location.pathname.slice(BASE_PATH.length)
    : location.pathname;
}