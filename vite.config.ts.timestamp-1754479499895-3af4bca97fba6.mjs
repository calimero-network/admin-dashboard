// vite.config.ts
import { defineConfig } from 'file:///Users/alen/www/calimero/admin-dashboard/node_modules/.pnpm/vite@5.4.19_@types+node@18.19.121_terser@5.43.1/node_modules/vite/dist/node/index.js';
import { nodePolyfills } from 'file:///Users/alen/www/calimero/admin-dashboard/node_modules/.pnpm/vite-plugin-node-polyfills@0.21.0_rollup@4.46.2_vite@5.4.19_@types+node@18.19.121_terser@5.43.1_/node_modules/vite-plugin-node-polyfills/dist/index.js';
import react from 'file:///Users/alen/www/calimero/admin-dashboard/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.19_@types+node@18.19.121_terser@5.43.1_/node_modules/@vitejs/plugin-react/dist/index.js';
import { resolve } from 'path';
var __vite_injected_original_dirname =
  '/Users/alen/www/calimero/admin-dashboard';
var vite_config_default = defineConfig({
  base: process.env.NODE_PATH_PREFIX
    ? `${process.env.NODE_PATH_PREFIX}/admin-dashboard/`
    : '/admin-dashboard/',
  build: {
    outDir: 'build',
    rollupOptions: {
      input: {
        main: resolve(__vite_injected_original_dirname, 'index.html'),
        404: resolve(__vite_injected_original_dirname, 'public/404.html'),
      },
    },
  },
  plugins: [nodePolyfills(), react()],
});
export { vite_config_default as default };
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvYWxlbi93d3cvY2FsaW1lcm8vYWRtaW4tZGFzaGJvYXJkXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvYWxlbi93d3cvY2FsaW1lcm8vYWRtaW4tZGFzaGJvYXJkL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9hbGVuL3d3dy9jYWxpbWVyby9hZG1pbi1kYXNoYm9hcmQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCB7IG5vZGVQb2x5ZmlsbHMgfSBmcm9tICd2aXRlLXBsdWdpbi1ub2RlLXBvbHlmaWxscyc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ3BhdGgnO1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgYmFzZTogcHJvY2Vzcy5lbnYuTk9ERV9QQVRIX1BSRUZJWCA/IGAke3Byb2Nlc3MuZW52Lk5PREVfUEFUSF9QUkVGSVh9L2FkbWluLWRhc2hib2FyZC9gIDogJy9hZG1pbi1kYXNoYm9hcmQvJyxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICdidWlsZCcsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbWFpbjogcmVzb2x2ZShfX2Rpcm5hbWUsICdpbmRleC5odG1sJyksXG4gICAgICAgIDQwNDogcmVzb2x2ZShfX2Rpcm5hbWUsICdwdWJsaWMvNDA0Lmh0bWwnKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbiAgcGx1Z2luczogW25vZGVQb2x5ZmlsbHMoKSwgcmVhY3QoKV0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMFMsU0FBUyxvQkFBb0I7QUFDdlUsU0FBUyxxQkFBcUI7QUFDOUIsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUh4QixJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNLFFBQVEsSUFBSSxtQkFBbUIsR0FBRyxRQUFRLElBQUksZ0JBQWdCLHNCQUFzQjtBQUFBLEVBQzFGLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLGVBQWU7QUFBQSxNQUNiLE9BQU87QUFBQSxRQUNMLE1BQU0sUUFBUSxrQ0FBVyxZQUFZO0FBQUEsUUFDckMsS0FBSyxRQUFRLGtDQUFXLGlCQUFpQjtBQUFBLE1BQzNDO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVMsQ0FBQyxjQUFjLEdBQUcsTUFBTSxDQUFDO0FBQ3BDLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
