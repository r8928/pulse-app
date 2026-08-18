'use client';

import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import AppBar from '@mui/material/AppBar';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ColorSchemeToggle } from './ColorSchemeToggle.jsx';
import { visibleNavigation } from './navigation.js';

const DRAWER_WIDTH = 232;

/**
 * Route to icon. Kept here rather than in `navigation.js` so that module stays
 * free of React and its gating logic testable without a DOM.
 */
const ICONS = {
  '/': HomeOutlined,
  '/exceptions': WarningAmberOutlined,
  '/users': PeopleOutlined,
  '/attendance': AccessTimeOutlined,
  '/leave': EventNoteOutlined,
  '/teams': GroupsOutlined,
  '/settings': SettingsOutlined,
  '/reports': AssessmentOutlined,
  '/audit': HistoryOutlined,
};

const isCurrent = (pathname, route) =>
  route === '/' ? pathname === '/' : pathname.startsWith(route);

/**
 * The authenticated shell.
 *
 * Pure: the signed-in user arrives as a prop and sign-out leaves as a
 * callback. It reads no session of its own — every role-dependent decision
 * derives from `user.permissions`, the resolved map from `session.js`, so the
 * navigation follows an S-19 edit with no code change.
 *
 * **Two drawers, one list.** `DESIGN.md` sizes for desktop first, so the
 * permanent drawer is the primary case and carries no toggle. Below `sm` it is
 * replaced by a temporary one behind a menu button, because a 232px permanent
 * drawer on a phone leaves no room for the tables these screens exist to show.
 * The navigation itself is rendered once and shared, so the two can never
 * drift apart.
 */
export function AppShell({ user, signOutAction, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = visibleNavigation(user?.permissions);

  const navigation = (
    <List component='nav' aria-label='Modules'>
      {items.map((item) => {
        const Icon = ICONS[item.route];
        const current = isCurrent(pathname, item.route);

        return (
          <ListItemButton
            key={item.route}
            component={Link}
            href={item.route}
            selected={current}
            aria-current={current ? 'page' : undefined}
            // Following a link on a phone should close the drawer that
            // covered the thing being navigated to.
            onClick={() => setOpen(false)}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              {Icon ? <Icon fontSize='small' /> : null}
            </ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        );
      })}
    </List>
  );

  return (
    <Stack direction='row' sx={{ minHeight: '100vh' }}>
      <AppBar
        position='fixed'
        color='inherit'
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar>
          <Stack
            direction='row'
            sx={{ flexGrow: 1, alignItems: 'center' }}
            spacing={2}
          >
            <IconButton
              aria-label='Open the navigation'
              edge='start'
              onClick={() => setOpen(true)}
              sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
            >
              <MenuOutlined />
            </IconButton>

            <Typography variant='sectionTitle' component='span'>
              Pulse
            </Typography>
          </Stack>

          <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
            <ColorSchemeToggle />
            <Stack sx={{ textAlign: 'right' }}>
              <Typography variant='bodyStrong'>{user.name}</Typography>
              {/* NFR-2: the role is spelled out rather than abbreviated. */}
              <Typography variant='metricLabel'>{user.role}</Typography>
            </Stack>
            <form action={signOutAction}>
              <Button type='submit' variant='outlined' size='small'>
                Sign out
              </Button>
            </form>
          </Stack>
        </Toolbar>
      </AppBar>

      <Drawer
        variant='temporary'
        open={open}
        onClose={() => setOpen(false)}
        // Keeps the markup mounted so the first open on a phone is instant.
        // `slotProps.root` is the v9 route to the underlying Modal; the old
        // `ModalProps` was removed in the v9 slots migration.
        slotProps={{ root: { keepMounted: true } }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        <Divider />
        {navigation}
      </Drawer>

      <Drawer
        variant='permanent'
        sx={{
          display: { xs: 'none', sm: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        <Divider />
        {navigation}
      </Drawer>

      <Stack component='main' sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        <Stack sx={{ p: 3, gap: 3 }}>{children}</Stack>
      </Stack>
    </Stack>
  );
}
