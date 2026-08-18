'use client';

import BrightnessAutoOutlined from '@mui/icons-material/BrightnessAutoOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import IconButton from '@mui/material/IconButton';
import { useColorScheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';

/**
 * The colour-scheme control in the AppBar.
 *
 * Three states, not two. A first-time visitor arrives on `system`, so the
 * interface matches what their OS already asked for; the control cycles
 * system → light → dark → system, which means choosing a mode is never a
 * one-way door out of following the system.
 *
 * `useColorScheme` owns the state and persists it to localStorage itself, so
 * this component holds none and the app needs no theme context of its own
 * (`CLAUDE.md` forbids the React Context API). The scheme is applied by a class
 * on `<html>`, written by `InitColorSchemeScript` before the first paint.
 *
 * The mode is named in the accessible name and the tooltip, never signalled by
 * the icon alone (NFR-12, DC-11).
 */

const CYCLE = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const PRESENTATION = {
  system: { Icon: BrightnessAutoOutlined, label: 'Following your system' },
  light: { Icon: LightModeOutlined, label: 'Light' },
  dark: { Icon: DarkModeOutlined, label: 'Dark' },
};

export function ColorSchemeToggle() {
  const { mode, setMode } = useColorScheme();

  // Undefined until mounted: the stored choice is not known during the server
  // render, and guessing it would render the wrong icon and then swap it.
  if (!mode) {
    return null;
  }

  const { Icon, label } = PRESENTATION[mode];
  const next = CYCLE[mode];

  // One string for both, so the tooltip and the accessible name can never
  // describe different states.
  const description = `Appearance: ${label}. Switch to ${PRESENTATION[
    next
  ].label.toLowerCase()}.`;

  return (
    <Tooltip title={description}>
      <IconButton onClick={() => setMode(next)} aria-label={description}>
        <Icon fontSize='small' />
      </IconButton>
    </Tooltip>
  );
}
