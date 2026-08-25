'use client';

import CloseOutlined from '@mui/icons-material/CloseOutlined';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { EmptyState } from '../EmptyState.jsx';
import { CONTENT_INSET_LEFT, CONTENT_INSET_TOP } from '../layout.js';
import { DetailedReportSheet } from './DetailedReportSheet.jsx';

/**
 * The detailed report, read on screen instead of downloaded.
 *
 * It covers the CONTENT AREA and nothing else — the sidebar and the top bar
 * stay visible and usable behind it, so the reader keeps their bearings and
 * can navigate away without hunting for a close button. That inset is the
 * whole reason `components/layout.js` exists: the same widths the shell sizes
 * its navigation with are the widths this subtracts, and one copy of that
 * arithmetic cannot drift from the other.
 *
 * The rows are fetched when it opens rather than rendered with the page. A
 * month of a whole team is a large read, and paying for it on every visit to
 * the summary — including the visits where nobody opens this — is a cost the
 * reader never asked for.
 */
export function DetailedReportDialog({ open, onClose, period, filters }) {
  const [state, setState] = useState({ status: 'idle', people: [] });

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setState({ status: 'loading', people: [] });

    const query = new URLSearchParams({ from: period.from, to: period.to });
    if (filters.teamId) query.set('teamId', filters.teamId);
    if (filters.userId) query.set('userId', filters.userId);

    fetch(`/api/attendance/day-by-day?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? 'That report could not be built.');
        }
        return response.json();
      })
      .then((body) => setState({ status: 'ready', people: body.people }))
      .catch((error) => {
        // An abort is the dialog closing, not a failure worth reporting.
        if (error.name === 'AbortError') return;
        setState({ status: 'failed', people: [], error: error.message });
      });

    return () => controller.abort();
  }, [open, period.from, period.to, filters.teamId, filters.userId]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby='detailed-report-title'
      sx={{
        // Inset past the shell rather than over it. The backdrop is made
        // absolute so it fills this inset box instead of the whole viewport —
        // left fixed, it would dim the sidebar this deliberately spares.
        ...CONTENT_INSET_TOP,
        left: CONTENT_INSET_LEFT,
        '& .MuiBackdrop-root': { position: 'absolute' },
        '& .MuiDialog-container': { height: '100%' },
      }}
      slotProps={{
        paper: {
          sx: {
            position: 'absolute',
            inset: 0,
            m: 0,
            maxHeight: 'none',
            borderRadius: 0,
          },
        },
      }}
    >
      <Stack
        direction='row'
        spacing={2}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Stack spacing={0.5}>
          <Typography variant='sectionTitle' id='detailed-report-title'>
            Detailed attendance report
          </Typography>
          <Typography variant='caption' color='text.secondary'>
            {period.from} to {period.to} — every date, worked or not
          </Typography>
        </Stack>

        <IconButton onClick={onClose} aria-label='Close the detailed report'>
          <CloseOutlined />
        </IconButton>
      </Stack>

      {state.status === 'loading' ? <LinearProgress /> : null}

      <Stack sx={{ flexGrow: 1, overflow: 'auto', p: { xs: 1, sm: 2 } }}>
        <Body state={state} />
      </Stack>
    </Dialog>
  );
}

function Body({ state }) {
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <Stack
        spacing={2}
        sx={{ alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}
      >
        <CircularProgress />
        <Typography variant='body2' color='text.secondary'>
          Building the report…
        </Typography>
      </Stack>
    );
  }

  if (state.status === 'failed') {
    return <Alert severity='error'>{state.error}</Alert>;
  }

  if (state.people.length === 0) {
    return (
      <EmptyState
        title='Nobody in this period'
        description='No colleague the current filter reaches has any dates in it. Widening the team or the period brings rows back.'
      />
    );
  }

  return <DetailedReportSheet people={state.people} />;
}
