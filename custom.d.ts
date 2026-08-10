/**
 * Asset module declarations.
 *
 * `*.svg` resolves to a URL string, not a React component: this project has no
 * svgr plugin in vite.config.ts, so Vite's default asset handling applies. The
 * declaration used to claim `React.FunctionComponent`, which was simply wrong —
 * call sites had to write `as unknown as string` to use the value in an
 * `<img src>`. Typed correctly, those casts are unnecessary.
 */
declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.svg?url' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.ico' {
  const src: string;
  export default src;
}
