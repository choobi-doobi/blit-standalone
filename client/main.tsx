import { StrictMode, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  FluentProvider,
  Toast,
  ToastTitle,
  Toaster,
  useId,
  useToastController,
} from '@fluentui/react-components';

import './app.css';
import './styles.css';
import BlitPage from './pages/BlitPage';
import { fluentThemeFor } from './lib/blitTheme';
import { useHostTheme } from './hooks/useIsMobile';
import { setToastSink } from './sdk/toast';
import { syncTheme } from './lib/prefs';

function AppToaster() {
  const toasterId = useId('blit-toaster');
  const { dispatchToast } = useToastController(toasterId);
  const theme = fluentThemeFor(useHostTheme());
  useEffect(() => {
    setToastSink(({ type, message, duration }) => {
      dispatchToast(
        <Toast>
          <ToastTitle>{message}</ToastTitle>
        </Toast>,
        { intent: type, timeout: duration === 0 ? -1 : (duration ?? 5000), position: 'bottom-end' },
      );
    });
    return () => setToastSink(null);
  }, [dispatchToast]);
  return (
    <FluentProvider theme={theme} style={{ background: 'transparent' }}>
      <Toaster toasterId={toasterId} />
    </FluentProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

syncTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="*" element={<BlitPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <AppToaster />
    </QueryClientProvider>
  </StrictMode>,
);
