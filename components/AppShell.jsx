'use client';

import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import PeopleOutlined from '@mui/icons-material/PeopleOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import AppBar from '@mui/material/AppBar';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
 */
export function AppShell({ user, signOutAction, children }) {
  const pathname = usePathname();
  const items = visibleNavigation(user?.permissions);

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
            <Typography variant='sectionTitle' component='span'>
              Pulse
            </Typography>
          </Stack>

          <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
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
        variant='permanent'
        sx={{
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
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {Icon ? <Icon fontSize='small' /> : null}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      <Stack component='main' sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        <Stack sx={{ p: 3, gap: 3 }}>{children}</Stack>
      </Stack>
    </Stack>
  );
}
