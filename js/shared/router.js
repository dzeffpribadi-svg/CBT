const routes = [];
let notFoundHandler = () => {
  document.getElementById('app').innerHTML = '<div class="empty-state">Halaman tidak ditemukan</div>';
};

export function addRoute(pattern, handler) {
  const paramNames = [];
  const regex = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((seg) => {
          if (seg.startsWith(':')) {
            paramNames.push(seg.slice(1));
            return '([^/]+)';
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$'
  );
  routes.push({ regex, paramNames, handler });
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

export async function resolveRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const [pathOnly, queryStr] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryStr || ''));

  for (const route of routes) {
    const match = pathOnly.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));
      window.scrollTo(0, 0);
      return route.handler(params, query);
    }
  }
  notFoundHandler();
}

export function navigate(path) {
  window.location.hash = `#${path}`;
}

export function startRouter() {
  window.addEventListener('hashchange', resolveRoute);
  resolveRoute();
}
