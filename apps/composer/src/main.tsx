import { Component, StrictMode } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@puckeditor/core/puck.css';
import { App } from './App';
import './styles.css';

/** Shows a render error in the page rather than a blank screen. */
class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[composer]', error.message, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ padding: 24, color: '#9b1c1c', whiteSpace: 'pre-wrap', fontSize: 13 }}>
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </pre>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </StrictMode>,
);
