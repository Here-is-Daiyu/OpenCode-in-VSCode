import React from 'react';
import { createRoot } from 'react-dom/client';
import '@vscode/codicons/dist/codicon.css';
import { SettingsApp } from './SettingsApp';

const root = createRoot(document.getElementById('root')!);
root.render(<SettingsApp />);
