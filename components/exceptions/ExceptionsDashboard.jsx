'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Pagination from '@mui/material/Pagination';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useMutations } from '../../hooks/useMutations.js';
import { usePtoMutations } from '../../hooks/usePtoMutations.js';
import {
  nothingOutstanding,
  QUEUE_ORDER,
  queueLabel,
} from '../../utils/queueLabels.js';
import { EmptyState } from '../EmptyState.jsx';
import { OriginateDialog } from '../pto/OriginateDialog.jsx';
import { ReasonDialog } from '../ReasonDialog.jsx';
import { QueueTable } from './QueueTable.jsx';
import { ReductionDialog } from './ReductionDialog.jsx';

/**
 * `S-05`. The single work queue: every unresolved item in the system surfaces
 * here and nowhere else (`FR-8.6`).
 *
 * Counts come from the server with the page, so a tab shows what is waiting
 * before anyone opens it. Rows are fetched **per tab** rather than all twelve
 * at once: the backlog grows with the roster, and `NFR-3`/`DC-10` require a
 * page rather than the whole thing.
 *
 * `§27.3`: an empty tab reads "Nothing outstanding" rather than rendering an
 * empty grid, and the dashboard also lets `OFFICE_ADMIN` start a PTO award or
 * CTO application for a day that raised no suggestion at all (`P-04`).
 */
const PAGE_SIZE = 25;

export function ExceptionsDashboard({
  counts,
  filters,
  canDecide,
  canImport,
  people,
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(QUEUE_ORDER[0]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loadError, setLoadError] = useState(null);
  const [dialog, setDialog] = useState(null);

  const { post, pending, error } = useMutations();
  const { originatePto } = usePtoMutations();

  /**
   * One loader, called by the effect when the tab, the page or the range
   * changes, and called again directly after a decision — the decision leaves
   * all three the same, so nothing else would re-run the read.
   */
  const load = useCallback(async () => {
    setLoadError(null);
    const query = new URLSearchParams({
      queue,
      from: filters.from,
      to: filters.to,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });

    try {
      const response = await fetch(`/api/exceptions?${query}`);
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error ?? 'That queue could not be read.');
      }
      setResult(body);
    } catch (caught) {
      // Per queue, never per page: one failing tab must not take the other
      // eleven down with it.
      setLoadError(caught.message);
      setResult({ items: [], total: 0 });
    }
  }, [queue, page, filters.from, filters.to]);

  useEffect(() => {
    load();
  }, [load]);

  const go = (next) => {
    const query = new URLSearchParams({ ...filters, ...next });
    router.push(`/exceptions?${query}`);
  };

  const close = () => setDialog(null);

  const refresh = () => {
    // The counts on the tabs are server props; the rows are this component's.
    router.refresh();
    load();
  };

  /** `P-05`'s two decisions, and `D-26`'s acknowledgement, share one path. */
  const decide = async (action, body) => {
    const url =
      action === 'dismiss'
        ? `/api/import-exceptions/${dialog.row.id}/dismiss`
        : `/api/approvals/${dialog.row.id}/${action}`;

    const done = await post(url, body);
    if (done) {
      close();
      refresh();
    }
    return done;
  };

  const pages = Math.ceil(result.total / PAGE_SIZE);

  return (
    <Stack spacing={2}>
      <Paper variant='outlined' sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <TextField
            label='From'
            type='date'
            value={filters.from}
            onChange={(event) => go({ from: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label='To'
            type='date'
            value={filters.to}
            onChange={(event) => go({ to: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {canDecide ? (
            <Button
              type='button'
              variant='outlined'
              onClick={() => setDialog({ action: 'originate' })}
            >
              Grant PTO manually
            </Button>
          ) : null}
        </Stack>
      </Paper>

      {error ? <Alert severity='error'>{error}</Alert> : null}

      <Tabs
        value={queue}
        onChange={(_event, next) => {
          setQueue(next);
          setPage(1);
        }}
        variant='scrollable'
        scrollButtons='auto'
      >
        {QUEUE_ORDER.map((name) => (
          <Tab
            key={name}
            value={name}
            label={`${queueLabel(name)} (${counts[name] ?? 0})`}
          />
        ))}
      </Tabs>

      {loadError ? <Alert severity='error'>{loadError}</Alert> : null}

      {result.items.length === 0 && !loadError ? (
        <EmptyState
          title='Nothing outstanding'
          description={nothingOutstanding(queue)}
        />
      ) : null}

      {result.items.length > 0 ? (
        <QueueTable
          queue={queue}
          rows={result.items}
          canDecide={canDecide}
          canImport={canImport}
          onAction={(action, row) => setDialog({ action, row })}
        />
      ) : null}

      {pages > 1 ? (
        <Stack sx={{ alignItems: 'center' }}>
          <Pagination
            count={pages}
            page={page}
            onChange={(_event, next) => setPage(next)}
          />
        </Stack>
      ) : null}

      {dialog?.action === 'originate' ? (
        <OriginateDialog
          kind='PTO'
          people={people}
          open
          onClose={close}
          onSubmit={async (data) => {
            if (await originatePto(data)) close();
          }}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.action === 'reduction' ? (
        <ReductionDialog
          approval={dialog.row}
          open
          onClose={close}
          onSubmit={decide}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.action === 'dismiss' ? (
        <ReasonDialog
          open
          onClose={close}
          onConfirm={(reason) => decide('dismiss', { reason })}
          title='Dismiss this import row'
          description='There is nothing to approve or decline about a row nobody could match — only to acknowledge it, once the sheet or the roster is fixed and re-imported. The row is kept, marked as dealt with.'
          confirmLabel='Dismiss'
          pending={pending}
          error={error}
        />
      ) : null}
    </Stack>
  );
}
