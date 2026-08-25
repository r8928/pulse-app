'use client';

import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
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
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ColorSchemeToggle } from './ColorSchemeToggle.jsx';
import { DRAWER_WIDTH, RAIL_WIDTH } from './layout.js';
import { visibleNavigation } from './navigation.js';

/** A finger's target, per `DESIGN.md` § Layout. Row density is unaffected. */
const TOUCH_TARGET = 44;

/** Wide enough that the reference tablet is never letterboxed. */
const CONTENT_MAX_WIDTH = 1440;

/**
 * The sign-out form lives outside the menu and is submitted by `form=`.
 * A `<form>` inside `Menu` would be a child of its `<ul>`, which is invalid.
 */
const SIGN_OUT_FORM = 'sign-out';

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
 * navigation follows an `S-19` edit with no code change.
 *
 * **Three bands, one list.** `DESIGN.md` sizes for the tablet first, so the
 * reference case is the `sm`-to-`lg` band: a permanent 72px icon rail. Below
 * `sm` it becomes a temporary drawer behind a menu button, because a permanent
 * drawer on a phone leaves no room for the tables these screens exist to show.
 * At `lg` and above space is no longer scarce and the labels come back. The
 * navigation is rendered once and shared, so the bands can never drift apart.
 *
 * Every item carries an `aria-label` whether or not its label is drawn: in the
 * rail band the text is not rendered, and without it the rail would be a row of
 * unnamed pictures to a screen reader.
 */
export function AppShell({ user, signOutAction, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(null);
  const items = visibleNavigation(user?.permissions);

  /**
   * @param {boolean} labelled whether this band draws the label beside the icon
   */
  const navigation = (labelled) => (
    <List component='nav' aria-label='Modules'>
      {items.map((item) => {
        const Icon = ICONS[item.route];
        const current = isCurrent(pathname, item.route);

        const button = (
          <ListItemButton
            key={item.route}
            component={Link}
            href={item.route}
            selected={current}
            aria-current={current ? 'page' : undefined}
            aria-label={item.label}
            // Following a link on a phone should close the drawer that
            // covered the thing being navigated to.
            onClick={() => setOpen(false)}
            sx={{
              minHeight: TOUCH_TARGET,
              justifyContent: labelled ? 'flex-start' : 'center',
            }}
          >
            <ListItemIcon
              sx={{ minWidth: labelled ? 36 : 0, justifyContent: 'center' }}
            >
              {Icon ? <Icon fontSize='small' /> : null}
            </ListItemIcon>
            {labelled ? <ListItemText primary={item.label} /> : null}
          </ListItemButton>
        );

        return labelled ? (
          <li key={item.route}>{button}</li>
        ) : (
          <li key={item.route}>
            <Tooltip title={item.label} placement='right'>
              {button}
            </Tooltip>
          </li>
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
          zIndex: (t) => t.zIndex.drawer + 1,
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
              sx={{
                display: { xs: 'inline-flex', sm: 'none' },
                minWidth: TOUCH_TARGET,
                minHeight: TOUCH_TARGET,
              }}
            >
              <MenuOutlined />
            </IconButton>

            <Stack
              component={Link}
              href='/'
              direction='row'
              spacing={1}
              aria-label='Pulse, home'
              sx={{
                alignItems: 'center',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              {/*
                Decorative: the wordmark beside it already names the product.

                The SVG carries no background of its own, so the bar's colour
                shows through the mark and through the ring at its centre in
                either scheme. A raster with a baked-in white ground sat in a
                white box here in dark mode.
              */}
              <Image
                src='/citrusbits-logo.svg'
                alt=''
                width={28}
                height={28}
                priority
              />
              <Typography variant='sectionTitle' component='span'>
                Pulse
              </Typography>
            </Stack>
          </Stack>

          <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
            <ColorSchemeToggle />

            <Button
              onClick={(event) => setAccount(event.currentTarget)}
              aria-haspopup='menu'
              aria-expanded={account ? 'true' : undefined}
              startIcon={<AccountCircleOutlined />}
              color='inherit'
              sx={{ minHeight: TOUCH_TARGET }}
            >
              {user.name}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      {/* Submitted by the menu item below, which cannot contain it. */}
      <form action={signOutAction} id={SIGN_OUT_FORM} />

      <Menu
        anchorEl={account}
        open={Boolean(account)}
        onClose={() => setAccount(null)}
      >
        <Stack sx={{ px: 2, py: 1 }}>
          <Typography variant='bodyStrong'>{user.name}</Typography>
          {/* NFR-2: the role is spelled out rather than abbreviated. */}
          <Typography variant='metricLabel'>{user.role}</Typography>
        </Stack>

        <Divider />

        <MenuItem
          component='button'
          type='submit'
          form={SIGN_OUT_FORM}
          sx={{ width: '100%', minHeight: TOUCH_TARGET }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <LogoutOutlined fontSize='small' />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>

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
        {navigation(true)}
      </Drawer>

      {/* The rail: the reference band, sm to lg. */}
      <Drawer
        variant='permanent'
        sx={{
          display: { xs: 'none', sm: 'block', lg: 'none' },
          width: RAIL_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: RAIL_WIDTH,
            boxSizing: 'border-box',
            overflowX: 'hidden',
          },
        }}
      >
        <Toolbar />
        <Divider />
        {navigation(false)}
      </Drawer>

      {/* Labels return once the width can afford them. */}
      <Drawer
        variant='permanent'
        sx={{
          display: { xs: 'none', lg: 'block' },
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
        {navigation(true)}
      </Drawer>

      <Stack component='main' sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        {/* Capped and centred: a row whose first and last cell are a head-turn
            apart on a wide monitor is a reading failure, not use of space. */}
        <Stack
          sx={{
            p: 3,
            gap: 3,
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            mx: 'auto',
          }}
        >
          {children}
        </Stack>
      </Stack>
    </Stack>
  );
}
