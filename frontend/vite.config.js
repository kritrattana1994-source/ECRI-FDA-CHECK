import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const getBangkokTimeString = () => {
  const now = new Date();
  const options = {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  return new Intl.DateTimeFormat('th-TH', options).format(now);
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(getBangkokTimeString()),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chart-vendor': ['chart.js', 'react-chartjs-2'],
          'icons': ['lucide-react'],
        },
      },
    },
  },
})

